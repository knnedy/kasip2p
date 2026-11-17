import { describe, expect, it } from "vitest";
import type { TransferRecord } from "@kasip2p/shared";
import { stripStoredBlobs, type HistoryKv } from "./strip-blobs";

const record = (id: string): TransferRecord => ({
  id,
  fileName: `${id}.bin`,
  fileSize: 10,
  mimeType: "",
  direction: "received",
  peerId: "p",
  peerName: "Phone",
  completedAt: 1,
});

function memoryKv(initial: [string, { record: TransferRecord; blob?: Blob }][]): HistoryKv & {
  data: Map<string, { record: TransferRecord; blob?: Blob }>;
} {
  const data = new Map(initial);
  return {
    data,
    entries: async () => [...data.entries()],
    set: async (k, v) => {
      data.set(k, v);
    },
  };
}

describe("stripStoredBlobs", () => {
  it("keeps every history record but drops the file copies", async () => {
    const kv = memoryKv([
      ["a", { record: record("a"), blob: new Blob(["x".repeat(10)]) }],
      ["b", { record: record("b") }],
    ]);
    await expect(stripStoredBlobs(kv)).resolves.toBe(1);
    expect([...kv.data.values()]).toEqual([{ record: record("a") }, { record: record("b") }]);
  });

  it("is a no-op once clean", async () => {
    const kv = memoryKv([["b", { record: record("b") }]]);
    await expect(stripStoredBlobs(kv)).resolves.toBe(0);
  });
});
