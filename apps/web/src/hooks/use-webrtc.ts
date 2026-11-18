"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { peerManager } from "@/lib/webrtc/peer-manager";
import {
  chooseChunkSize,
  createAcceptRegistry,
  createReceiver,
  sendFile,
} from "@/lib/webrtc/chunk-utils";
import { parsePeerMessage } from "@kasip2p/shared";
import { activeTransfers, failedTransfers, transfersReducer } from "@/lib/transfer/machine";
import { createProgressThrottle } from "@/lib/transfer/progress-throttle";
import {
  createIncomingStore,
  releaseAfterDownload,
  removeIncoming,
} from "@/lib/transfer/file-store";
import { downloadBlob } from "@/lib/download";
import { saveTransfer } from "@/lib/store/idb";
import { peerNames } from "@/lib/signaling/ws-client";
import { sendWithRetry, TransferCancelled } from "@/lib/transfer/retry";
import { generateId } from "@/lib/utils";
import { createSendQueue } from "@/lib/transfer/send-queue";
import { createPauseGate } from "@/lib/transfer/pause-gate";
import type { Outgoing } from "@/lib/transfer/folders";
import { createWakeLock } from "@/lib/wake-lock";

const REOPEN_TIMEOUT_MS = 30_000;

// React glue: binds peerManager + chunk-utils to the transfer reducer and history.
export function useWebRTC(
  localPeerId: string,
  onTransferComplete?: () => void,
) {
  const [state, dispatch] = useReducer(transfersReducer, {});
  const onCompleteRef = useRef(onTransferComplete);
  // a render per chunk starved the main thread that also drains the data channel
  const [progress] = useState(() =>
    createProgressThrottle((transferId, transferredBytes) =>
      dispatch({
        type: "progressed",
        transferId,
        transferredBytes,
        at: Date.now(),
      }),
    ),
  );

  const [accepts] = useState(() => createAcceptRegistry());
  // per outgoing transfer: abort on cancel, gate for either side's pause
  const [outgoing] = useState(
    () =>
      new Map<string, { controller: AbortController; gate: ReturnType<typeof createPauseGate> }>(),
  );
  // files of failed sends, kept so they can be queued again
  const [failedFiles] = useState(() => new Map<string, { peerId: string; file: File }>());
  const [receivers] = useState(() => new Map<string, ReturnType<typeof createReceiver>>());

  useEffect(() => () => progress.dispose(), [progress]);

  useEffect(() => {
    onCompleteRef.current = onTransferComplete;
  }, [onTransferComplete]);

  useEffect(() => {
    if (!localPeerId) return;
    peerManager.start(localPeerId);

    const receiverFor = (remoteId: string) =>
      createReceiver(
        {
          onStart: (meta, offset) =>
            dispatch({
              type: "started",
              at: Date.now(),
              offset,
              info: {
                transferId: meta.transferId,
                peerId: remoteId,
                fileName: meta.name,
                totalBytes: meta.size,
                direction: "receiving",
              },
            }),
          onProgress: (meta, transferredBytes) =>
            progress.report(meta.transferId, transferredBytes),
          onComplete: async (meta, file) => {
            progress.finish(meta.transferId);
            // staged (non-streamed) files are handed to the browser as a normal download
            // file.name, not meta.name: a finished folder arrives as "<folder>.zip"
            if (file) downloadBlob(file, file.name);
            // history is metadata only; the file itself lives in Downloads
            await saveTransfer({
              id: meta.transferId,
              fileName: meta.name,
              fileSize: meta.size,
              mimeType: meta.mimeType,
              direction: "received",
              peerId: remoteId,
              peerName: peerNames.get(remoteId),
              completedAt: Date.now(),
            });
            if (file) releaseAfterDownload(meta.folder?.id ?? meta.transferId, file.size);
            else await removeIncoming(meta.transferId);
            dispatch({
              type: "completed",
              transferId: meta.transferId,
              at: Date.now(),
            });
            onCompleteRef.current?.();
          },
          onSuspend: (meta) => {
            progress.finish(meta.transferId);
            dispatch({
              type: "failed",
              transferId: meta.transferId,
              reason: "interrupted",
            });
          },
          onError: (meta, err) => {
            progress.finish(meta.transferId);
            dispatch({
              type: "failed",
              transferId: meta.transferId,
              reason: String(err),
            });
          },
        },
        createIncomingStore,
        (reply) => peerManager.sendControl(remoteId, reply),
      );

    peerManager.setMessageHandler((remoteId, data) => {
      if (typeof data === "string") {
        const msg = parsePeerMessage(data);
        if (msg?.type === "file-accept") {
          accepts.resolve(msg);
          return;
        }
        const mine = msg && "transferId" in msg ? outgoing.get(msg.transferId) : undefined;
        if (msg?.type === "transfer-cancel" && mine) {
          const reason = msg.reason ? `: ${msg.reason}` : "";
          mine.controller.abort(new TransferCancelled(`cancelled by receiver${reason}`));
          return;
        }
        if (msg?.type === "transfer-pause" || msg?.type === "transfer-resume") {
          // our send: the receiver's pause gates it; their receive: display only
          if (msg.type === "transfer-pause") {
            mine?.gate.pause("remote");
            dispatch({ type: "paused", transferId: msg.transferId, by: "remote" });
          } else {
            mine?.gate.resume("remote");
            dispatch({ type: "resumed", transferId: msg.transferId, by: "remote" });
          }
          return;
        }
      }
      let receiver = receivers.get(remoteId);
      if (!receiver) {
        receiver = receiverFor(remoteId);
        receivers.set(remoteId, receiver);
      }
      receiver.handle(data);
    });

    const stopChannelEvents = peerManager.onChannelEvent((remoteId, event) => {
      if (event !== "close") return;
      receivers.get(remoteId)?.suspend();
      accepts.rejectPeer(remoteId, "data channel closed");
    });

    return () => {
      stopChannelEvents();
      peerManager.setMessageHandler(null);
      receivers.clear();
    };
  }, [localPeerId, progress, accepts, outgoing, receivers]);

  function initiate(targetId: string) {
    peerManager.start(localPeerId);
    peerManager.connect(targetId);
  }

  // One file at a time per device; bound to the latest sendOne below.
  const [queue] = useState(() => createSendQueue());

  async function sendOne(targetId: string, { file, folder }: Outgoing) {
    const transferId = generateId();
    dispatch({
      type: "started",
      at: Date.now(),
      info: {
        transferId,
        peerId: targetId,
        fileName: file.name,
        totalBytes: file.size,
        direction: "sending",
      },
    });

    const controller = new AbortController();
    const gate = createPauseGate();
    outgoing.set(transferId, { controller, gate });
    try {
      // same transferId on every attempt, so the receiver resumes its partial
      await sendWithRetry(
        () => {
          peerManager.connect(targetId);
          return peerManager.waitForOpenChannel(targetId, REOPEN_TIMEOUT_MS);
        },
        (dc) =>
          sendFile(
            dc,
            file,
            transferId,
            (transferredBytes) => progress.report(transferId, transferredBytes),
            chooseChunkSize(peerManager.getMaxMessageSize(targetId)),
            (id) => accepts.wait(id, targetId),
            controller.signal,
            undefined,
            () => gate.wait(),
            folder,
          ),
      );
    } catch (err) {
      progress.finish(transferId);
      const reason = err instanceof Error ? err.message : String(err);
      // a folder arrives as one zip, so a failed file ends the folder; send it again whole
      if (folder) queue.removeFolder(folder.id);
      else failedFiles.set(transferId, { peerId: targetId, file });
      dispatch({ type: "failed", transferId, reason });
      return;
    } finally {
      outgoing.delete(transferId);
    }
    progress.finish(transferId);

    await saveTransfer({
      id: transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      direction: "sent",
      peerId: targetId,
      peerName: peerNames.get(targetId),
      completedAt: Date.now(),
    });
    dispatch({ type: "completed", transferId, at: Date.now() });
    onCompleteRef.current?.();
  }

  // Pause/resume/cancel from this side, for a send or a receive.
  function control(transferId: string, action: "pause" | "resume" | "cancel") {
    const transfer = state[transferId];
    if (transfer?.status !== "active") return;
    const { peerId, direction } = transfer.info;
    const mine = outgoing.get(transferId);
    const tell = (type: "transfer-pause" | "transfer-resume" | "transfer-cancel") =>
      peerManager.sendControl(peerId, JSON.stringify({ type, transferId }));

    if (action === "cancel") {
      if (direction === "sending") {
        tell("transfer-cancel");
        mine?.controller.abort(new TransferCancelled("cancelled"));
      } else {
        receivers.get(peerId)?.cancel(transferId, "cancelled by receiver");
      }
      return;
    }
    if (action === "pause") {
      mine?.gate.pause("local");
      tell("transfer-pause");
      dispatch({ type: "paused", transferId, by: "local" });
      return;
    }
    mine?.gate.resume("local");
    tell("transfer-resume");
    dispatch({ type: "resumed", transferId, by: "local" });
  }

  function disconnect(peerId: string) {
    peerManager.close(peerId);
  }

  const transfers = useMemo(() => activeTransfers(state), [state]);
  const busy = transfers.length > 0;

  const wakeLock = useRef<ReturnType<typeof createWakeLock> | null>(null);
  useEffect(() => {
    const lock = createWakeLock({
      request: "wakeLock" in navigator ? () => navigator.wakeLock.request("screen") : undefined,
      visible: () => document.visibilityState === "visible",
      onVisibilityChange(listener) {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    wakeLock.current = lock;
    return () => lock.dispose();
  }, []);
  useEffect(() => {
    wakeLock.current?.set(busy);
  }, [busy]);

  const activeFor = (peerId: string) => activeTransfers(state, peerId);

  const failedFor = (peerId: string) =>
    failedTransfers(state, peerId).map((f) => ({ ...f, canRetry: failedFiles.has(f.transferId) }));

  function dismiss(transferId: string) {
    failedFiles.delete(transferId);
    dispatch({ type: "dismissed", transferId });
  }

  // Sends the same file again as a new transfer, at the back of the queue.
  function retry(transferId: string) {
    const failed = failedFiles.get(transferId);
    if (!failed) return;
    dismiss(transferId);
    queue.add(failed.peerId, [{ file: failed.file }]);
  }

  useEffect(() => {
    queue.bind(sendOne);
  });

  const send = (targetId: string, outgoing: Outgoing[]) => queue.add(targetId, outgoing);

  return { transfers, activeFor, failedFor, retry, dismiss, queue, initiate, send, control, disconnect };
}
