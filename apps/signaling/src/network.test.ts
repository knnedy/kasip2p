import { describe, expect, it } from "vitest";
import { clientIp, LOCAL_NETWORK, networkKey } from "./network.ts";

describe("networkKey", () => {
  it.each([
    "192.168.0.101",
    "10.1.2.3",
    "172.20.0.1",
    "127.0.0.1",
    "::1",
    "::ffff:192.168.0.5",
    "fe80::1",
    "fd12:3456::1",
    undefined,
  ])("treats %s as the local network", (ip) => {
    expect(networkKey(ip)).toBe(LOCAL_NETWORK);
  });

  it("keys public IPv4 by address", () => {
    expect(networkKey("41.90.1.2")).toBe("v4:41.90.1.2");
    expect(networkKey("::ffff:41.90.1.2")).toBe("v4:41.90.1.2");
    expect(networkKey("172.32.0.1")).toBe("v4:172.32.0.1");
  });

  it("groups public IPv6 by /64", () => {
    const a = networkKey("2001:db8:abcd:12::1");
    const b = networkKey("2001:0db8:abcd:0012:ffff::9");
    expect(a).toBe("v6:2001:0db8:abcd:0012");
    expect(b).toBe(a);
    expect(networkKey("2001:db8:abcd:13::1")).not.toBe(a);
  });
});

describe("clientIp", () => {
  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    expect(clientIp("1.1.1.1", "10.0.0.1", false)).toBe("10.0.0.1");
  });

  it("uses the rightmost (proxy-appended) entry, not a spoofed leftmost one", () => {
    expect(clientIp("6.6.6.6, 41.90.1.2", "10.0.0.1", true)).toBe("41.90.1.2");
  });

  it("falls back to the socket address", () => {
    expect(clientIp(undefined, "10.0.0.1", true)).toBe("10.0.0.1");
  });
});
