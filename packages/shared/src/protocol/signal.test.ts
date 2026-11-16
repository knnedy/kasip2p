import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "./signal.ts";

const meta = {
  peerId: "3f2b9c1e-0000-4000-8000-000000000000",
  name: "Linux x86_64",
  os: "linux",
  deviceType: "desktop",
};
const secret = "a".repeat(32);

describe("parseClientMessage", () => {
  it("accepts a register message", () => {
    const msg = { type: "register", meta, secret };
    expect(parseClientMessage(JSON.stringify(msg))).toEqual({ ok: true, message: msg });
  });

  it("requires a well-formed secret on register", () => {
    for (const bad of [undefined, "short", "Z".repeat(32)]) {
      const result = parseClientMessage(JSON.stringify({ type: "register", meta, secret: bad }));
      expect(result.ok).toBe(false);
    }
  });

  it("accepts ping", () => {
    expect(parseClientMessage(JSON.stringify({ type: "ping" })).ok).toBe(true);
  });

  it("strips a client-supplied fromId so the server cannot be spoofed", () => {
    const result = parseClientMessage(
      JSON.stringify({ type: "pair-request", fromId: "evil", targetId: "abc" }),
    );
    expect(result).toEqual({
      ok: true,
      message: { type: "pair-request", targetId: "abc" },
    });
  });

  it("rejects invalid json", () => {
    expect(parseClientMessage("{nope")).toEqual({
      ok: false,
      error: "invalid json",
    });
  });

  it("rejects unknown message types", () => {
    const result = parseClientMessage(JSON.stringify({ type: "peer-list" }));
    expect(result.ok).toBe(false);
  });

  it.each(["12a456", "1234", "12345", "1234567", ""])("rejects pin %j", (pin) => {
    const result = parseClientMessage(
      JSON.stringify({ type: "pair-confirm", targetId: "abc", pin }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects peer ids with unsafe characters", () => {
    const result = parseClientMessage(
      JSON.stringify({ type: "pair-request", targetId: "a:b" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects oversized sdp", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "sdp",
        targetId: "abc",
        sdp: { type: "offer", sdp: "x".repeat(32_001) },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts an ice candidate with null sdpMid", () => {
    const result = parseClientMessage(
      JSON.stringify({
        type: "ice",
        targetId: "abc",
        candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: null },
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("parseServerMessage", () => {
  it("accepts a typed error", () => {
    const msg = { type: "error", code: "incorrect-pin", message: "incorrect PIN" };
    expect(parseServerMessage(JSON.stringify(msg))).toEqual({ ok: true, message: msg });
  });

  it("rejects an error without a known code", () => {
    const result = parseServerMessage(
      JSON.stringify({ type: "error", code: "boom", message: "x" }),
    );
    expect(result.ok).toBe(false);
  });

  it("requires fromId on relayed messages", () => {
    const result = parseServerMessage(JSON.stringify({ type: "pair-accept" }));
    expect(result.ok).toBe(false);
  });
});
