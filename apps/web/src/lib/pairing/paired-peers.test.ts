import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@kasip2p/shared";
import { createPairedPeers, type SessionStorageLike } from "./paired-peers";

function memoryStorage(): SessionStorageLike {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const accept = (fromId: string): ServerMessage => ({ type: "pair-accept", fromId });
const reject = (fromId: string): ServerMessage => ({ type: "pair-reject", fromId });

describe("paired peers", () => {
  it("records a peer once the server accepts the pairing", () => {
    const paired = createPairedPeers(memoryStorage());
    expect(paired.has("bob")).toBe(false);
    paired.observe(accept("bob"));
    expect(paired.has("bob")).toBe(true);
  });

  it("forgets a peer that rejects or unpairs", () => {
    const paired = createPairedPeers(memoryStorage());
    paired.observe(accept("bob"));
    paired.observe(reject("bob"));
    expect(paired.has("bob")).toBe(false);
  });

  it("survives a reload within the tab", () => {
    const storage = memoryStorage();
    createPairedPeers(storage).observe(accept("bob"));
    expect(createPairedPeers(storage).has("bob")).toBe(true);
  });

  it("can drop a peer the server no longer considers paired", () => {
    const paired = createPairedPeers(memoryStorage());
    paired.observe(accept("bob"));
    paired.forget("bob");
    expect(paired.has("bob")).toBe(false);
  });

  it("notifies subscribers with a new snapshot only when the set changes", () => {
    const paired = createPairedPeers(memoryStorage());
    const listener = vi.fn();
    paired.subscribe(listener);
    const before = paired.snapshot();
    paired.observe(accept("bob"));
    paired.observe(accept("bob"));
    paired.observe({ type: "pong" });
    expect(listener).toHaveBeenCalledOnce();
    expect(paired.snapshot()).not.toBe(before);
    expect(paired.snapshot()).toEqual(["bob"]);
  });

  it("works for this session when storage is blocked", () => {
    const blocked: SessionStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const paired = createPairedPeers(blocked);
    paired.observe(accept("bob"));
    expect(paired.has("bob")).toBe(true);
  });
});
