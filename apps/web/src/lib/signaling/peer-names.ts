import type { PeerMeta } from "@kasip2p/shared";

// Last-known names by peer id; kept after a peer leaves so history can still label it.
export function createPeerNames() {
  const names = new Map<string, string>();
  return {
    update(peers: PeerMeta[]) {
      for (const p of peers) names.set(p.peerId, p.name);
    },
    get: (peerId: string) => names.get(peerId) ?? peerId,
  };
}
