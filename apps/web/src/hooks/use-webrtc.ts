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
import { activeTransfers, transfersReducer } from "@/lib/transfer/machine";
import { createProgressThrottle } from "@/lib/transfer/progress-throttle";
import {
  createIncomingStore,
  releaseAfterDownload,
  removeIncoming,
} from "@/lib/transfer/file-store";
import { downloadBlob } from "@/lib/download";
import { saveTransfer } from "@/lib/store/idb";
import { peerNames } from "@/lib/signaling/ws-client";
import { sendWithRetry } from "@/lib/transfer/retry";
import { generateId } from "@/lib/utils";

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

  useEffect(() => () => progress.dispose(), [progress]);

  useEffect(() => {
    onCompleteRef.current = onTransferComplete;
  }, [onTransferComplete]);

  useEffect(() => {
    if (!localPeerId) return;
    peerManager.start(localPeerId);

    const receivers = new Map<string, ReturnType<typeof createReceiver>>();
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
            if (file) downloadBlob(file, meta.name);
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
            if (file) releaseAfterDownload(meta.transferId, meta.size);
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
      accepts.rejectAll("data channel closed");
    });

    return () => {
      stopChannelEvents();
      peerManager.setMessageHandler(null);
    };
  }, [localPeerId, progress, accepts]);

  function initiate(targetId: string) {
    peerManager.start(localPeerId);
    peerManager.connect(targetId);
  }

  async function transfer(targetId: string, file: File) {
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
            accepts.wait,
          ),
      );
    } catch (err) {
      progress.finish(transferId);
      dispatch({ type: "failed", transferId, reason: String(err) });
      return;
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

  function disconnect(peerId: string) {
    peerManager.close(peerId);
  }

  const transfers = useMemo(() => activeTransfers(state), [state]);

  return { transfers, initiate, transfer, disconnect };
}
