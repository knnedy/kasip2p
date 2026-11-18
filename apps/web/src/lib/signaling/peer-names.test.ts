import { describe, expect, it } from "vitest";
import type { PeerMeta } from "@kasip2p/shared";
import { createPeerNames } from "./peer-names";

const peer = (peerId: string, name: string): PeerMeta => ({
  peerId,
  name,
  os: "linux",
  deviceType: "desktop",
});

describe("peer names", () => {
  it("names peers from the latest peer list", () => {
    const names = createPeerNames();
    names.update([peer("a", "Laptop")]);
    names.update([peer("a", "Kitchen laptop")]);
    expect(names.get("a")).toBe("Kitchen laptop");
  });

  it("remembers a peer that left the list, so history still gets its name", () => {
    const names = createPeerNames();
    names.update([peer("a", "Laptop")]);
    names.update([]);
    expect(names.get("a")).toBe("Laptop");
  });

  it("falls back to the id for unknown peers", () => {
    expect(createPeerNames().get("zz")).toBe("zz");
  });
});

describe("peer directory", () => {
  const phone = { peerId: "p", name: "Pixel", os: "android", deviceType: "mobile" } as const;
  const laptop = { peerId: "l", name: "Laptop", os: "linux", deviceType: "desktop" } as const;

  it("keeps the latest online list for pages that mount later", () => {
    const dir = createPeerNames();
    dir.update([phone, laptop]);
    expect(dir.online()).toEqual([phone, laptop]);
    expect(dir.online()).toBe(dir.online()); // stable between changes
  });

  it("remembers a device's details after it leaves", () => {
    const dir = createPeerNames();
    dir.update([phone]);
    dir.update([]);
    expect(dir.online()).toEqual([]);
    expect(dir.meta("p")?.os).toBe("android");
    expect(dir.meta("missing")).toBeUndefined();
  });

  it("notifies subscribers on each update", () => {
    const dir = createPeerNames();
    let calls = 0;
    const stop = dir.subscribe(() => (calls += 1));
    dir.update([phone]);
    stop();
    dir.update([]);
    expect(calls).toBe(1);
  });
});
