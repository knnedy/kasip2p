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

  it("returns null for garbage or unknown types", () => {
    expect(parsePeerMessage("not json")).toBeNull();
    expect(parsePeerMessage(JSON.stringify({ type: "nope" }))).toBeNull();
  });
});
