"use client";

import { useSyncExternalStore } from "react";
import { pairedPeers } from "@/lib/signaling/ws-client";

const NONE: readonly string[] = [];

// Peer ids paired in this tab; empty during SSR.
export function usePairedPeers(): readonly string[] {
  return useSyncExternalStore(pairedPeers.subscribe, pairedPeers.snapshot, () => NONE);
}
