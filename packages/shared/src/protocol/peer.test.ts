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

  it("parses a file that belongs to a folder", () => {
    const meta = {
      type: "file-meta",
      transferId: "t1",
      name: "b.txt",
      size: 3,
      mimeType: "",
      totalChunks: 1,
      folder: { id: "f1", name: "photos", path: "photos/2024/b.txt", index: 0, count: 2 },
    };
    expect(parsePeerMessage(JSON.stringify(meta))).toEqual(meta);
  });

  it("rejects folder paths that could escape the folder", () => {
    const withPath = (path: string) =>
      JSON.stringify({
        type: "file-meta",
        transferId: "t1",
        name: "b",
        size: 0,
        mimeType: "",
        totalChunks: 0,
        folder: { id: "f1", name: "photos", path, index: 0, count: 1 },
      });
    for (const bad of ["../b", "/etc/b", "a//b", "a\\b", "a/./b", "C:/b", "a/"]) {
      expect(parsePeerMessage(withPath(bad)), bad).toBeNull();
    }
    expect(parsePeerMessage(withPath("photos/b"))).not.toBeNull();
  });

  it("rejects a folder index outside its count", () => {
    const meta = {
      type: "file-meta",
      transferId: "t1",
      name: "b",
      size: 0,
      mimeType: "",
      totalChunks: 0,
      folder: { id: "f1", name: "photos", path: "photos/b", index: 2, count: 2 },
    };
    expect(parsePeerMessage(JSON.stringify(meta))).toBeNull();
  });

  it("parses file-accept and rejects a negative offset", () => {
    const accept = { type: "file-accept", transferId: "t1", offset: 1024 };
    expect(parsePeerMessage(JSON.stringify(accept))).toEqual(accept);
    expect(parsePeerMessage(JSON.stringify({ ...accept, offset: -1 }))).toBeNull();
  });

  it("parses transfer-ack and rejects negative or fractional byte counts", () => {
    const ack = { type: "transfer-ack", transferId: "t1", bytes: 4096 };
    expect(parsePeerMessage(JSON.stringify(ack))).toEqual(ack);
    expect(parsePeerMessage(JSON.stringify({ ...ack, bytes: -1 }))).toBeNull();
    expect(parsePeerMessage(JSON.stringify({ ...ack, bytes: 1.5 }))).toBeNull();
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
