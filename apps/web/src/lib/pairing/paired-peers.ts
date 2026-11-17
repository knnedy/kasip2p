import type { ServerMessage } from "@kasip2p/shared";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "kasip2p:paired-peers";

// Peers the server has paired us with, so revisiting one skips the PIN.
// Per tab: the server keeps pairings across reconnects for our peer secret.
export function createPairedPeers(storage: SessionStorageLike) {
  let peers: readonly string[] = [];
  try {
    const stored: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (Array.isArray(stored)) peers = stored.filter((p) => typeof p === "string");
  } catch {
    // blocked or corrupt storage: start empty
  }
  const listeners = new Set<() => void>();

  function commit(next: readonly string[]) {
    peers = next;
    try {
      storage.setItem(KEY, JSON.stringify(peers));
    } catch {
      // kept in memory for this session
    }
    listeners.forEach((l) => l());
  }

  function forget(peerId: string) {
    if (peers.includes(peerId)) commit(peers.filter((p) => p !== peerId));
  }

  return {
    has: (peerId: string) => peers.includes(peerId),
    snapshot: () => peers,
    forget,
    observe(msg: ServerMessage) {
      if (msg.type === "pair-accept" && !peers.includes(msg.fromId)) {
        commit([...peers, msg.fromId]);
      } else if (msg.type === "pair-reject") {
        forget(msg.fromId);
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
