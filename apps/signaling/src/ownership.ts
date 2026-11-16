import { createHash, timingSafeEqual } from "node:crypto";

interface Owner {
  hash: Buffer;
  releasedAt: number | null; // null while a socket holds the id
}

function hashSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// Binds a peerId to the first secret that claims it, until released and the grace ends.
export class OwnershipRegistry {
  private owners = new Map<string, Owner>();

  constructor(
    private now: () => number,
    private graceMs: number,
  ) {}

  claim(peerId: string, secret: string): boolean {
    const hash = hashSecret(secret);
    const owner = this.owners.get(peerId);
    if (owner && !this.expired(owner) && !timingSafeEqual(owner.hash, hash)) {
      return false;
    }
    this.owners.set(peerId, { hash, releasedAt: null });
    return true;
  }

  release(peerId: string) {
    const owner = this.owners.get(peerId);
    if (owner) owner.releasedAt = this.now();
  }

  sweep() {
    for (const [peerId, owner] of this.owners) {
      if (this.expired(owner)) this.owners.delete(peerId);
    }
  }

  private expired(owner: Owner) {
    return owner.releasedAt !== null && this.now() - owner.releasedAt >= this.graceMs;
  }
}
