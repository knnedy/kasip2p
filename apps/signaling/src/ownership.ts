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

  // "returning": same owner within grace; "new": first claim or the old owner's grace ended.
  claim(peerId: string, secret: string): "taken" | "returning" | "new" {
    const hash = hashSecret(secret);
    const owner = this.owners.get(peerId);
    const live = owner !== undefined && !this.expired(owner);
    if (live && !timingSafeEqual(owner.hash, hash)) return "taken";
    this.owners.set(peerId, { hash, releasedAt: null });
    return live ? "returning" : "new";
  }

  release(peerId: string) {
    const owner = this.owners.get(peerId);
    if (owner) owner.releasedAt = this.now();
  }

  // Returns ids whose grace ended, so callers can drop state tied to them.
  sweep(): string[] {
    const expired: string[] = [];
    for (const [peerId, owner] of this.owners) {
      if (!this.expired(owner)) continue;
      this.owners.delete(peerId);
      expired.push(peerId);
    }
    return expired;
  }

  private expired(owner: Owner) {
    return owner.releasedAt !== null && this.now() - owner.releasedAt >= this.graceMs;
  }
}
