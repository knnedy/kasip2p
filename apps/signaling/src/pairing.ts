import { timingSafeEqual } from "node:crypto";

function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

// Directed: the requester asks, only the approver may set the PIN.
function requestKey(requesterId: string, approverId: string) {
  return `${requesterId}>${approverId}`;
}

function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type ConfirmResult = "ok" | "incorrect" | "expired" | "locked";

export interface PairingOptions {
  now?: () => number;
  ttlMs?: number;
  maxAttempts?: number;
}

interface PendingPin {
  pin: string;
  expiresAt: number;
  attempts: number;
}

export class PairingRegistry {
  private requests = new Map<string, number>(); // key -> expiresAt
  private pendingPins = new Map<string, PendingPin>();
  private active = new Set<string>();
  private now: () => number;
  private ttlMs: number;
  private maxAttempts: number;

  constructor(opts: PairingOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? 2 * 60_000;
    this.maxAttempts = opts.maxAttempts ?? 5;
  }

  request(requesterId: string, approverId: string) {
    this.requests.set(requestKey(requesterId, approverId), this.now() + this.ttlMs);
  }

  // Returns false unless requesterId has a live request to approverId.
  setPin(approverId: string, requesterId: string, pin: string): boolean {
    const key = requestKey(requesterId, approverId);
    const expiresAt = this.requests.get(key);
    if (expiresAt === undefined || expiresAt <= this.now()) {
      this.clear(key);
      return false;
    }
    this.pendingPins.set(key, { pin, expiresAt: this.now() + this.ttlMs, attempts: 0 });
    return true;
  }

  // A correct PIN activates the pair; too many wrong ones cancel the request.
  confirm(requesterId: string, approverId: string, pin: string): ConfirmResult {
    const key = requestKey(requesterId, approverId);
    const pending = this.pendingPins.get(key);
    if (!pending) return "incorrect";
    if (pending.expiresAt <= this.now()) {
      this.clear(key);
      return "expired";
    }
    if (!sameSecret(pending.pin, pin)) {
      pending.attempts += 1;
      if (pending.attempts < this.maxAttempts) return "incorrect";
      this.clear(key);
      return "locked";
    }
    this.clear(key);
    this.active.add(pairKey(requesterId, approverId));
    return "ok";
  }

  isPaired(a: string, b: string): boolean {
    return this.active.has(pairKey(a, b));
  }

  unpair(a: string, b: string) {
    this.active.delete(pairKey(a, b));
    this.clear(requestKey(a, b));
    this.clear(requestKey(b, a));
  }

  removePeer(peerId: string) {
    for (const key of this.active) {
      if (key.split(":").includes(peerId)) this.active.delete(key);
    }
    for (const store of [this.requests, this.pendingPins] as const) {
      for (const key of store.keys()) {
        if (key.split(">").includes(peerId)) store.delete(key);
      }
    }
  }

  // Drops expired requests and PINs; called periodically by the server.
  sweep() {
    const now = this.now();
    for (const [key, expiresAt] of this.requests) {
      if (expiresAt <= now) this.clear(key);
    }
    for (const [key, pending] of this.pendingPins) {
      if (pending.expiresAt <= now) this.clear(key);
    }
  }

  private clear(key: string) {
    this.requests.delete(key);
    this.pendingPins.delete(key);
  }
}
