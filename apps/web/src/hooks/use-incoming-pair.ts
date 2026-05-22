"use client";

import { useEffect, useState } from "react";
import { signalingClient } from "@/lib/signaling/ws-client";
import type { PeerMeta } from "@kasip2p/shared";

export interface IncomingPairRequest {
  fromId: string;
  fromMeta?: PeerMeta;
}

export function useIncomingPair(peers: { meta: PeerMeta }[]) {
  const [incoming, setIncoming] = useState<IncomingPairRequest | null>(null);

  useEffect(() => {
    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "pair-request") {
        const fromMeta = peers.find((p) => p.meta.peerId === msg.fromId)?.meta;
        setIncoming({ fromId: msg.fromId, fromMeta });
      }
      if (msg.type === "pair-reject") {
        setIncoming(null);
      }
    });

    return () => cleanup();
  }, [peers]);

  function dismiss() {
    setIncoming(null);
  }

  return { incoming, dismiss };
}
