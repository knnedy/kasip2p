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
    signalingClient.connect(localPeerId);

    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "peer-list") {
        setPeers((prev) => {
          return msg.peers
            .filter((p) => p.peerId !== localPeerId) // exclude self
            .map((meta) => {
              const existing = prev.find((e) => e.meta.peerId === meta.peerId);
              return {
                meta,
                connectionState: existing?.connectionState ?? "discovered",
              };
            });
        });
      }
    });

    return () => {
      cleanup();
      signalingClient.disconnect();
    };
  }, [localPeerId]);

  function updatePeerState(peerId: string, connectionState: ConnectionState) {
    setPeers((prev) =>
      prev.map((p) => (p.meta.peerId ? { ...p, connectionState } : p)),
    );
  }

  return { peers, updatePeerState };
}
