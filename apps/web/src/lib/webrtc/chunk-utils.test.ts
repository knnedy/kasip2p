import type { FileMeta } from "@kasip2p/shared";
import { describe, expect, it, vi } from "vitest";
import {
  chooseChunkSize,
  DEFAULT_CHUNK_SIZE as CHUNK_SIZE,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  createReceiver,
  sendFile,
  type ChunkSink,
} from "./chunk-utils";

type SinkEvent = "bufferedamountlow" | "close";

class FakeSink implements ChunkSink {
  sent: (string | ArrayBuffer)[] = [];
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  readyState: RTCDataChannelState = "open";
  private listeners = new Map<SinkEvent, Set<() => void>>();
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  addEventListener(type: SinkEvent, l: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(l);
    this.listeners.set(type, set);
  }
  removeEventListener(type: SinkEvent, l: () => void) {
    this.listeners.get(type)?.delete(l);
  }
  emit(type: SinkEvent) {
    [...(this.listeners.get(type) ?? [])].forEach((l) => l());
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it("pauses above the high-water mark until bufferedamountlow fires", async () => {
    const sink = new FakeSink();
    sink.bufferedAmount = HIGH_WATER_MARK + 1;
    const done = sendFile(sink, makeFile(10), "t1", () => {});

    await flush();
    expect(sink.bufferedAmountLowThreshold).toBe(LOW_WATER_MARK);
    expect(sink.sent).toHaveLength(1); // only meta

    sink.bufferedAmount = 0;
    sink.emit("bufferedamountlow");
    await done;
    expect(sink.sent).toHaveLength(2);
    expect(sink.listenerCount()).toBe(0);
  });

  it("fails instead of hanging when the channel closes while paused", async () => {
    const sink = new FakeSink();
    sink.bufferedAmount = HIGH_WATER_MARK + 1;
    const done = sendFile(sink, makeFile(10), "t1", () => {});
    await flush();
    sink.readyState = "closed";
    sink.emit("close");
    await expect(done).rejects.toThrow("data channel closed");
    expect(sink.listenerCount()).toBe(0);
  });

  it("uses the requested chunk size", async () => {
    const sink = new FakeSink();
    await sendFile(sink, makeFile(256 * 1024 + 1), "t1", () => {}, 256 * 1024);
    expect(sink.sent).toHaveLength(3); // meta + 2 chunks
    expect(JSON.parse(sink.sent[0] as string)).toMatchObject({ totalChunks: 2 });
  });
});

describe("chooseChunkSize", () => {
  it("uses the remote limit capped at 256KB, defaulting to 64KB", () => {
    expect(chooseChunkSize(undefined)).toBe(64 * 1024);
    expect(chooseChunkSize(Infinity)).toBe(64 * 1024);
    expect(chooseChunkSize(262_144)).toBe(256 * 1024);
    expect(chooseChunkSize(1_073_741_823)).toBe(256 * 1024);
    expect(chooseChunkSize(8 * 1024)).toBe(8 * 1024);
  });
});
