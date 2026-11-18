import type { PeerMeta } from "@kasip2p/shared";

const NONE: readonly PeerMeta[] = [];

// Device directory: the latest online list (so pages that mount later see it at
// once) plus last-known details per id, kept after a device leaves for history.
export function createPeerNames() {
  const known = new Map<string, PeerMeta>();
  let online: readonly PeerMeta[] = NONE;
  const listeners = new Set<() => void>();
  return {
    update(peers: PeerMeta[]) {
      for (const p of peers) known.set(p.peerId, p);
      online = peers;
      listeners.forEach((l) => l());
    },
    get: (peerId: string) => known.get(peerId)?.name ?? peerId,
    meta: (peerId: string) => known.get(peerId),
    online: () => online,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
