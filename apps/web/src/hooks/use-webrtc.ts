"use client";

import { useEffect, useRef, useState } from "react";
import { signalingClient } from "@/lib/signaling/ws-client";
import {
  createOffer,
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  closeConnection,
} from "@/lib/webrtc/peer-manager";
import { sendFile, createReceiver } from "@/lib/webrtc/chunk-utils";
import { saveTransfer } from "@/lib/store/idb";
import type { TransferProgress } from "@kasip2p/shared";

export function useWebRTC(localPeerId: string) {
  const [progress, setProgress] = useState<Map<string, TransferProgress>>(
    new Map(),
  );
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  useEffect(() => {
    const cleanup = signalingClient.onMessage(async (msg) => {
      switch (msg.type) {
        case "sdp": {
          if (msg.sdp.type === "offer") {
            const pc = await handleOffer(msg.fromId, localPeerId, msg.sdp);
            pc.ondatachannel = ({ channel }) => {
              registerChannel(channel, msg.fromId);
            };
          } else if (msg.sdp.type === "answer") {
            await handleAnswer(msg.fromId, msg.sdp);
          }
          break;
        }
        case "ice": {
          await handleIceCandidate(msg.fromId, msg.candidate);
          break;
        }
      }
    });

    return () => cleanup();
  }, [localPeerId]);

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
      },
    );

    dc.onmessage = ({ data }) => receiver(data as ArrayBuffer | string);
  }

  async function initiate(targetId: string) {
    const { dc } = await createOffer(targetId, localPeerId);
    registerChannel(dc, targetId);
  }

  async function transfer(targetId: string, file: File) {
    const dc = dataChannels.current.get(targetId);
    if (!dc) return;

    const transferId = crypto.randomUUID();

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
