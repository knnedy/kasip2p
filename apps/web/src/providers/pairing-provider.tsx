"use client";

import { useState, useEffect } from "react";
import { signalingClient } from "@/lib/signaling/ws-client";
import { useIncomingPair } from "@/hooks/use-incoming-pair";
import { PairRequestModal } from "@/components/pair-request-modal";
import type { PeerMeta } from "@kasip2p/shared";

export function PairingProvider({ children }: { children: React.ReactNode }) {
  const [peers, setPeers] = useState<{ meta: PeerMeta }[]>([]);

  const [localPeerId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("kasip2p-peer-id") ?? "";
  });

  useEffect(() => {
    if (!localPeerId) return;
    signalingClient.connect(localPeerId);

    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "peer-list") {
        setPeers(msg.peers.map((meta) => ({ meta })));
      }
    });

    return () => cleanup();
  }, [localPeerId]);

  const { incoming, dismiss } = useIncomingPair(peers);

  return (
    <>
      {children}
      {incoming && <PairRequestModal incoming={incoming} onDismiss={dismiss} />}
    </>
  );
}
