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

  it("returns null for garbage or unknown types", () => {
    expect(parsePeerMessage("not json")).toBeNull();
    expect(parsePeerMessage(JSON.stringify({ type: "nope" }))).toBeNull();
  });
});
