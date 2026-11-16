import type { PeerMeta } from "@kasip2p/shared";

export class PeerRegistry<C> {
  private peers = new Map<string, { conn: C; meta: PeerMeta }>();

  set(meta: PeerMeta, conn: C) {
    this.peers.set(meta.peerId, { conn, meta });
  }

  get(peerId: string): C | undefined {
    return this.peers.get(peerId)?.conn;
  }

  // Only removes when conn still owns the id, so a quick refresh keeps the new socket.
  remove(peerId: string, conn: C): boolean {
    if (this.peers.get(peerId)?.conn !== conn) return false;
    return this.peers.delete(peerId);
  }

  entries(): [PeerMeta, C][] {
    return Array.from(this.peers.values(), (p) => [p.meta, p.conn]);
  }
}
