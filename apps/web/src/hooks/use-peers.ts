"use client";

import { useMemo, useSyncExternalStore } from "react";
import { peerNames } from "@/lib/signaling/ws-client";
import type { PeerMeta, ConnectionState } from "@kasip2p/shared";

export interface PeerEntry {
  meta: PeerMeta;
  connectionState: ConnectionState;
}

const NONE: readonly PeerMeta[] = [];

// Other devices online now, from the shared directory: no wait for the next broadcast.
export function usePeers(localPeerId: string) {
  const online = useSyncExternalStore(peerNames.subscribe, peerNames.online, () => NONE);
  const peers = useMemo(
    () =>
      online
        .filter((p) => p.peerId !== localPeerId)
        .map((meta): PeerEntry => ({ meta, connectionState: "discovered" })),
    [online, localPeerId],
  );
  return { peers };
}
