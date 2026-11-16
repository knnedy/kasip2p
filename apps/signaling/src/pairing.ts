function pairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

export class PairingRegistry {
  private pendingPins = new Map<string, string>();
  private active = new Set<string>();

  setPin(a: string, b: string, pin: string) {
    this.pendingPins.set(pairKey(a, b), pin);
  }

  // Consumes the pending PIN and activates the pair when it matches.
  confirm(a: string, b: string, pin: string): boolean {
    const key = pairKey(a, b);
    const expected = this.pendingPins.get(key);
    if (expected === undefined || expected !== pin) return false;
    this.pendingPins.delete(key);
    this.active.add(key);
    return true;
  }

  isPaired(a: string, b: string): boolean {
    return this.active.has(pairKey(a, b));
  }

  unpair(a: string, b: string) {
    this.active.delete(pairKey(a, b));
  }

  removePeer(peerId: string) {
    for (const store of [this.active, this.pendingPins] as const) {
      for (const key of store.keys()) {
        if (key.split(":").includes(peerId)) store.delete(key);
      }
    }
  }
}
