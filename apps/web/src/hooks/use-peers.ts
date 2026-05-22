"use client";

import { useEffect, useState } from "react";
import { signalingClient } from "@/lib/signaling/ws-client";
import type { PeerMeta, ConnectionState } from "@kasip2p/shared";

export interface PeerEntry {
  meta: PeerMeta;
  connectionState: ConnectionState;
}

export function usePeers(localPeerId: string) {
  const [peers, setPeers] = useState<PeerEntry[]>([]);

  useEffect(() => {
    if (!localPeerId) return;

    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "peer-list") {
        setPeers(
          msg.peers
            .filter((p) => p.peerId !== localPeerId)
            .map((meta) => ({
              meta,
              connectionState: "discovered" as ConnectionState,
            })),
        );
      }
    });

    return () => cleanup();
  }, [localPeerId]);

  function updatePeerState(peerId: string, connectionState: ConnectionState) {
    setPeers((prev) =>
      prev.map((p) =>
        p.meta.peerId === peerId ? { ...p, connectionState } : p,
      ),
    );
  }

  return { peers, updatePeerState };
}
