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
