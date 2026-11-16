import type { FileMeta } from "@kasip2p/shared";
import { describe, expect, it, vi } from "vitest";
import { CHUNK_SIZE, createReceiver, sendFile, type ChunkSink } from "./chunk-utils";

class FakeSink implements ChunkSink {
  sent: (string | ArrayBuffer)[] = [];
  bufferedAmount = 0;
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
}

function makeFile(size: number, name = "a.bin") {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  return new File([bytes], name, { type: "application/octet-stream" });
}

describe("sendFile + createReceiver", () => {
  it("round-trips a multi-chunk file byte for byte", async () => {
    const file = makeFile(CHUNK_SIZE * 2 + 123);
    const sink = new FakeSink();
    const sentProgress: number[] = [];

    await sendFile(sink, file, "t1", (n) => sentProgress.push(n));

    expect(sink.sent).toHaveLength(4); // meta + 3 chunks
    expect(sentProgress.at(-1)).toBe(file.size);

    const onComplete = vi.fn<(meta: FileMeta, file: File) => void>();
    const onProgress = vi.fn();
    const onStart = vi.fn();
    const receive = createReceiver({ onStart, onProgress, onComplete });
    sink.sent.forEach(receive);

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: "t1", name: "a.bin", totalChunks: 3 }),
    );
    expect(onProgress).toHaveBeenLastCalledWith(expect.anything(), file.size);
    expect(onComplete).toHaveBeenCalledOnce();

    const [, received] = onComplete.mock.calls[0]!;
    expect(received.name).toBe("a.bin");
    expect(new Uint8Array(await received.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
  });

  it("ignores binary data that arrives before any file-meta", () => {
    const onProgress = vi.fn();
    const receive = createReceiver({ onStart: vi.fn(), onProgress, onComplete: vi.fn() });
    receive(new ArrayBuffer(8));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("ignores malformed control messages", () => {
    const onStart = vi.fn();
    const receive = createReceiver({ onStart, onProgress: vi.fn(), onComplete: vi.fn() });
    receive("not json");
    receive(JSON.stringify({ type: "file-meta", name: "x" }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("waits while the channel buffer is full", async () => {
    vi.useFakeTimers();
    const sink = new FakeSink();
    sink.bufferedAmount = 32 * 1024 * 1024;
    const done = sendFile(sink, makeFile(10), "t1", () => {});

    await vi.advanceTimersByTimeAsync(200);
    expect(sink.sent).toHaveLength(1); // only meta

    sink.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(sink.sent).toHaveLength(2);
    vi.useRealTimers();
  });
});
