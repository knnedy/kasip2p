"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { peerManager } from "@/lib/webrtc/peer-manager";
import { createReceiver, sendFile } from "@/lib/webrtc/chunk-utils";
import { activeTransfers, transfersReducer } from "@/lib/transfer/machine";
import { saveTransfer } from "@/lib/store/idb";
import { generateId } from "@/lib/utils";

// React glue: binds peerManager + chunk-utils to the transfer reducer and history.
export function useWebRTC(
  localPeerId: string,
  onTransferComplete?: () => void,
) {
  const [state, dispatch] = useReducer(transfersReducer, {});
  const onCompleteRef = useRef(onTransferComplete);

  useEffect(() => {
    onCompleteRef.current = onTransferComplete;
  }, [onTransferComplete]);

  useEffect(() => {
    if (!localPeerId) return;
    peerManager.start(localPeerId);

    const receivers = new Map<string, ReturnType<typeof createReceiver>>();
    const receiverFor = (remoteId: string) =>
      createReceiver({
        onStart: (meta) =>
          dispatch({
            type: "started",
            at: Date.now(),
            info: {
              transferId: meta.transferId,
              peerId: remoteId,
              fileName: meta.name,
              totalBytes: meta.size,
              direction: "receiving",
            },
          }),
        onProgress: (meta, transferredBytes) =>
          dispatch({
            type: "progressed",
            transferId: meta.transferId,
            transferredBytes,
            at: Date.now(),
          }),
        onComplete: async (meta, file) => {
          await saveTransfer(
            {
              id: meta.transferId,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              direction: "received",
              peerId: remoteId,
              peerName: remoteId,
              completedAt: Date.now(),
            },
            file,
          );
          dispatch({ type: "completed", transferId: meta.transferId, at: Date.now() });
          onCompleteRef.current?.();
        },
      });

    peerManager.setMessageHandler((remoteId, data) => {
      let receive = receivers.get(remoteId);
      if (!receive) {
        receive = receiverFor(remoteId);
        receivers.set(remoteId, receive);
      }
      receive(data);
    });

    return () => peerManager.setMessageHandler(null);
  }, [localPeerId]);

  function initiate(targetId: string) {
    peerManager.start(localPeerId);
    peerManager.connect(targetId);
  }

  async function transfer(targetId: string, file: File) {
    const dc = peerManager.getOpenChannel(targetId);
    if (!dc) {
      console.error("data channel not open");
      return;
    }

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
      await sendFile(dc, file, transferId, (transferredBytes) =>
        dispatch({ type: "progressed", transferId, transferredBytes, at: Date.now() }),
      );
    } catch (err) {
      dispatch({ type: "failed", transferId, reason: String(err) });
      return;
    }

    await saveTransfer({
      id: transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      direction: "sent",
      peerId: targetId,
      peerName: targetId,
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
