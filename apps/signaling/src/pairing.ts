function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

// Directed: the requester asks, only the approver may set the PIN.
function requestKey(requesterId: string, approverId: string) {
  return `${requesterId}>${approverId}`;
}

export class PairingRegistry {
  private requests = new Set<string>();
  private pendingPins = new Map<string, string>();
  private active = new Set<string>();

  request(requesterId: string, approverId: string) {
    this.requests.add(requestKey(requesterId, approverId));
  }

  // Returns false unless requesterId actually asked approverId to pair.
  setPin(approverId: string, requesterId: string, pin: string): boolean {
    const key = requestKey(requesterId, approverId);
    if (!this.requests.has(key)) return false;
    this.pendingPins.set(key, pin);
    return true;
  }

  // Consumes the pending PIN and activates the pair when it matches.
  confirm(requesterId: string, approverId: string, pin: string): boolean {
    const key = requestKey(requesterId, approverId);
    const expected = this.pendingPins.get(key);
    if (expected === undefined || expected !== pin) return false;
    this.pendingPins.delete(key);
    this.requests.delete(key);
    this.active.add(pairKey(requesterId, approverId));
    return true;
  }

  isPaired(a: string, b: string): boolean {
    return this.active.has(pairKey(a, b));
  }

  unpair(a: string, b: string) {
    this.active.delete(pairKey(a, b));
    for (const key of [requestKey(a, b), requestKey(b, a)]) {
      this.requests.delete(key);
      this.pendingPins.delete(key);
    }
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
}
