"use client";

import { useState, useEffect } from "react";
import { getOrCreatePeerId } from "@/lib/peer-id";
import { signalingClient } from "@/lib/signaling/ws-client";
import { peerManager } from "@/lib/webrtc/peer-manager";
import { useIncomingPair } from "@/hooks/use-incoming-pair";
import { PairRequestModal } from "@/components/pair-request-modal";
import { ConnectionStatus } from "@/components/connection-status";
import type { PeerMeta } from "@kasip2p/shared";

export function PairingProvider({ children }: { children: React.ReactNode }) {
  const [peers, setPeers] = useState<{ meta: PeerMeta }[]>([]);

  const [localPeerId] = useState<string>(getOrCreatePeerId);

  useEffect(() => {
    if (!localPeerId) return;
    signalingClient.connect(localPeerId);
    // handle SDP/ICE app-wide so nothing is lost while routing to /transfer
    peerManager.start(localPeerId);

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
      <ConnectionStatus />
      {children}
      {incoming && <PairRequestModal incoming={incoming} onDismiss={dismiss} />}
    </>
  );
}
