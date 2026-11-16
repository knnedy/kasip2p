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
import type { CreateStore } from "@/lib/transfer/file-store";

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
    await flush();

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

  it("completes a zero-byte file", async () => {
    const sink = new FakeSink();
    await sendFile(sink, makeFile(0, "empty.txt"), "t0", () => {});
    expect(sink.sent).toHaveLength(1); // meta only

    const onComplete = vi.fn<(meta: FileMeta, file: File) => void>();
    const receive = createReceiver({ onStart: vi.fn(), onProgress: vi.fn(), onComplete });
    sink.sent.forEach(receive);
    await flush();

    expect(onComplete).toHaveBeenCalledOnce();
    const [, file] = onComplete.mock.calls[0]!;
    expect(file.name).toBe("empty.txt");
    expect(file.size).toBe(0);
  });

  it("handles back-to-back files on one channel", async () => {
    const sink = new FakeSink();
    await sendFile(sink, makeFile(0, "a"), "t1", () => {});
    await sendFile(sink, makeFile(10, "b"), "t2", () => {});

    const onComplete = vi.fn<(meta: FileMeta, file: File) => void>();
    const receive = createReceiver({ onStart: vi.fn(), onProgress: vi.fn(), onComplete });
    sink.sent.forEach(receive);
    await flush();

    expect(onComplete.mock.calls.map(([m, f]) => [m.transferId, f.size])).toEqual([
      ["t1", 0],
      ["t2", 10],
    ]);
  });

  it("writes to the store strictly in order even when writes are slow", async () => {
    const written: number[] = [];
    const slowStore: CreateStore = async (meta) => ({
      async write(chunk) {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        written.push(new Uint8Array(chunk)[0]!);
      },
      async finish() {
        return new File([], meta.name);
      },
      async abort() {},
    });
    const onComplete = vi.fn();
    const receive = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete },
      slowStore,
    );
    receive(JSON.stringify({ type: "file-meta", transferId: "t", name: "x", size: 5, mimeType: "", totalChunks: 5 }));
    for (let i = 0; i < 5; i++) receive(new Uint8Array([i]).buffer);

    expect(onComplete).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(written).toEqual([0, 1, 2, 3, 4]);
  });

  it("reports a failed write and aborts the store", async () => {
    const abort = vi.fn(async () => {});
    const failing: CreateStore = async () => ({
      write: async () => {
        throw new Error("disk full");
      },
      finish: async () => new File([], "x"),
      abort,
    });
    const onError = vi.fn();
    const onComplete = vi.fn();
    const receive = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete, onError },
      failing,
    );
    receive(JSON.stringify({ type: "file-meta", transferId: "t", name: "x", size: 1, mimeType: "", totalChunks: 1 }));
    receive(new ArrayBuffer(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onComplete).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });

  it("aborts an unfinished file when a new file-meta arrives", async () => {
    const aborts: string[] = [];
    const store: CreateStore = async (meta) => ({
      write: async () => {},
      finish: async () => new File([], meta.name),
      abort: async () => {
        aborts.push(meta.transferId);
      },
    });
    const receive = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn() },
      store,
    );
    receive(JSON.stringify({ type: "file-meta", transferId: "old", name: "a", size: 10, mimeType: "", totalChunks: 1 }));
    receive(new ArrayBuffer(4));
    receive(JSON.stringify({ type: "file-meta", transferId: "new", name: "b", size: 0, mimeType: "", totalChunks: 0 }));
    await flush();
    expect(aborts).toEqual(["old"]);
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
