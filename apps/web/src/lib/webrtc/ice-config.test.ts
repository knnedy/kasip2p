import { describe, expect, it, vi } from "vitest";
import { parseIceServers } from "./ice-config";

describe("parseIceServers", () => {
  it("defaults to no servers", () => {
    expect(parseIceServers(undefined)).toEqual([]);
    expect(parseIceServers("  ")).toEqual([]);
  });

  it("parses STUN and TURN entries", () => {
    const servers = [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: ["turn:turn.example:3478"], username: "u", credential: "p" },
    ];
    expect(parseIceServers(JSON.stringify(servers))).toEqual(servers);
  });

  it("falls back to none on invalid input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseIceServers("not json")).toEqual([]);
    expect(parseIceServers(JSON.stringify([{ url: "stun:x" }]))).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
