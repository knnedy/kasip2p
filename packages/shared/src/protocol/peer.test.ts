import { describe, expect, it } from "vitest";
import { parsePeerMessage } from "./peer.ts";

describe("parsePeerMessage", () => {
  it("parses file-meta", () => {
    const meta = {
      type: "file-meta",
      transferId: "t1",
      name: "a.txt",
      size: 0,
      mimeType: "",
      totalChunks: 0,
    };
    expect(parsePeerMessage(JSON.stringify(meta))).toEqual(meta);
  });

  it("parses file-accept and rejects a negative offset", () => {
    const accept = { type: "file-accept", transferId: "t1", offset: 1024 };
    expect(parsePeerMessage(JSON.stringify(accept))).toEqual(accept);
    expect(parsePeerMessage(JSON.stringify({ ...accept, offset: -1 }))).toBeNull();
  });

  it("parses pause, resume and cancel controls for a transfer", () => {
    for (const type of ["transfer-pause", "transfer-resume", "transfer-cancel"]) {
      const msg = { type, transferId: "t1" };
      expect(parsePeerMessage(JSON.stringify(msg))).toEqual(msg);
    }
  });

  it("carries an optional, bounded reason on cancel", () => {
    const msg = { type: "transfer-cancel", transferId: "t1", reason: "download cancelled" };
    expect(parsePeerMessage(JSON.stringify(msg))).toEqual(msg);
    expect(
      parsePeerMessage(JSON.stringify({ ...msg, reason: "x".repeat(201) })),
    ).toBeNull();
  });

  it("rejects a control without a transfer id", () => {
    expect(parsePeerMessage(JSON.stringify({ type: "transfer-pause" }))).toBeNull();
  });

  it("returns null for garbage or unknown types", () => {
    expect(parsePeerMessage("not json")).toBeNull();
    expect(parsePeerMessage(JSON.stringify({ type: "nope" }))).toBeNull();
  });
});
