"use client";

import { useEffect, useRef, useState } from "react";
import { signalingClient } from "@/lib/signaling/ws-client";
import {
  handleSdp,
  handleIce,
  initiateConnection,
  closeConnection,
} from "@/lib/webrtc/peer-manager";
import { sendFile, createReceiver } from "@/lib/webrtc/chunk-utils";
import { saveTransfer } from "@/lib/store/idb";
import { generateId } from "@/lib/utils";
import type { TransferProgress } from "@kasip2p/shared";

export function useWebRTC(
  localPeerId: string,
  onTransferComplete?: () => void,
) {
  const [progress, setProgress] = useState<Map<string, TransferProgress>>(
    new Map(),
  );
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const onTransferCompleteRef = useRef(onTransferComplete);

  useEffect(() => {
    onTransferCompleteRef.current = onTransferComplete;
  }, [onTransferComplete]);

  function registerChannel(dc: RTCDataChannel, remotePeerId: string) {
    dataChannels.current.set(remotePeerId, dc);

    const receiver = createReceiver(
      (p) => setProgress((prev) => new Map(prev).set(p.transferId, p)),
      async (file, transferId) => {
        await saveTransfer(
          {
            id: transferId,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            direction: "received",
            peerId: remotePeerId,
            peerName: remotePeerId,
            completedAt: Date.now(),
          },
          file,
        );
        setProgress((prev) => {
          const next = new Map(prev);
          next.delete(transferId);
          return next;
        });
        onTransferCompleteRef.current?.();
      },
    );

    dc.onmessage = ({ data }) => receiver(data as ArrayBuffer | string);
  }

  useEffect(() => {
    if (!localPeerId) return;

    const cleanup = signalingClient.onMessage(async (msg) => {
      switch (msg.type) {
        case "sdp": {
          await handleSdp(localPeerId, msg.fromId, msg.sdp, (dc) =>
            registerChannel(dc, msg.fromId),
          );
          break;
        }
        case "ice": {
          await handleIce(localPeerId, msg.fromId, msg.candidate, (dc) =>
            registerChannel(dc, msg.fromId),
          );
          break;
        }
      }
    });

    return () => cleanup();
  }, [localPeerId]);

  function initiate(targetId: string) {
    const dc = initiateConnection(localPeerId, targetId, (channel) =>
      registerChannel(channel, targetId),
    );
    return dc;
  }

  async function transfer(targetId: string, file: File) {
    const dc = dataChannels.current.get(targetId);
    if (!dc || dc.readyState !== "open") {
      console.error("data channel not open");
      return;
    }

    const transferId = generateId();

    await sendFile(dc, file, transferId, (p) =>
      setProgress((prev) => new Map(prev).set(p.transferId, p)),
    );

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

    onTransferCompleteRef.current?.();

    setProgress((prev) => {
      const next = new Map(prev);
      next.delete(transferId);
      return next;
    });
  }

  function disconnect(peerId: string) {
    closeConnection(peerId);
    dataChannels.current.delete(peerId);
  }

  return { progress, initiate, transfer, disconnect };
}
