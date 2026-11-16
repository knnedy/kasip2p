import { describe, expect, it } from "vitest";
import { isInitiator, sdpFingerprint } from "./peer-manager";

describe("isInitiator", () => {
  it("picks exactly one side of every pair", () => {
    const ids = ["3f2b-aa", "9c01-bb", "0000-cc", "ffff-dd"];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(isInitiator(a, b)).not.toBe(isInitiator(b, a));
      }
    }
  });
});

describe("sdpFingerprint", () => {
  it("extracts the DTLS fingerprint line", () => {
    const sdp = "v=0\r\na=fingerprint:sha-256 AB:CD:EF\r\na=setup:actpass\r\n";
    expect(sdpFingerprint(sdp)).toBe("sha-256 AB:CD:EF");
  });

  it("returns null when absent", () => {
    expect(sdpFingerprint("v=0\r\n")).toBeNull();
    expect(sdpFingerprint(undefined)).toBeNull();
  });
});
