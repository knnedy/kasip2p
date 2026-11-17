"use client";

import { useEffect, useState } from "react";
import { peerManager } from "@/lib/webrtc/peer-manager";
import type { ConnectionInfo } from "@/lib/webrtc/connection-info";

const POLL_MS = 2_000;

// Polls getStats for the live route and round-trip time to a peer.
export function useConnectionInfo(remoteId: string): ConnectionInfo | null {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const next = await peerManager.getConnectionInfo(remoteId).catch(() => null);
      if (alive) setInfo(next);
    };
    const timer = setInterval(poll, POLL_MS);
    void poll();
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [remoteId]);
  return info;
}
