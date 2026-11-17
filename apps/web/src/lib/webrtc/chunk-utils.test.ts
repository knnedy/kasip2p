import type { FileMeta } from "@kasip2p/shared";
import { describe, expect, it, vi } from "vitest";
import {
  chooseChunkSize,
  DEFAULT_CHUNK_SIZE as CHUNK_SIZE,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  createAcceptRegistry,
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

const meta = (transferId: string, size: number) =>
  JSON.stringify({ type: "file-meta", transferId, name: transferId, size, mimeType: "", totalChunks: 1 });

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
    const { handle: receive } = createReceiver({ onStart, onProgress, onComplete });
    sink.sent.forEach(receive);
    await flush();

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: "t1", name: "a.bin", totalChunks: 3 }),
      0,
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
    const { handle: receive } = createReceiver({ onStart: vi.fn(), onProgress: vi.fn(), onComplete });
    sink.sent.forEach(receive);
    await flush();

    expect(onComplete).toHaveBeenCalledOnce();
    const [, file] = onComplete.mock.calls[0]!;
    expect(file.name).toBe("empty.txt");
    expect(file.size).toBe(0);
  });

  it("handles back-to-back files over a loopback with the accept handshake", async () => {
    const onComplete = vi.fn<(meta: FileMeta, file: File) => void>();
    const accepts = createAcceptRegistry();
    const { handle: receive } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete },
      undefined,
      (reply) => {
        const msg = JSON.parse(reply);
        if (msg.type === "file-accept") accepts.resolve(msg);
      },
    );
    const sink = new FakeSink();
    sink.send = (data) => receive(data);

    await sendFile(sink, makeFile(0, "a"), "t1", () => {}, undefined, accepts.wait);
    await sendFile(sink, makeFile(10, "b"), "t2", () => {}, undefined, accepts.wait);

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    expect(onComplete.mock.calls.map(([m, f]) => [m.transferId, f.size])).toEqual([
      ["t1", 0],
      ["t2", 10],
    ]);
  });

  it("writes to the store strictly in order even when writes are slow", async () => {
    const written: number[] = [];
    const slowStore: CreateStore = async (meta) => ({
      offset: 0,
      suspend: async () => {},
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
    const { handle: receive } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete },
      slowStore,
      () => {},
      1, // one write per chunk, so ordering is observable
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
      offset: 0,
      suspend: async () => {},
      write: async () => {
        throw new Error("disk full");
      },
      finish: async () => new File([], "x"),
      abort,
    });
    const onError = vi.fn();
    const onComplete = vi.fn();
    const { handle: receive } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete, onError },
      failing,
    );
    receive(JSON.stringify({ type: "file-meta", transferId: "t", name: "x", size: 1, mimeType: "", totalChunks: 1 }));
    receive(new ArrayBuffer(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onComplete).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalled();
  });

  it("suspends (keeps) an unfinished file when a new file-meta arrives", async () => {
    const events: string[] = [];
    const store: CreateStore = async (meta) => ({
      offset: 0,
      write: async () => {},
      finish: async () => new File([], meta.name),
      suspend: async () => {
        events.push(`suspend:${meta.transferId}`);
      },
      abort: async () => {
        events.push(`abort:${meta.transferId}`);
      },
    });
    const { handle: receive } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn() },
      store,
    );
    receive(meta("old", 10));
    receive(new ArrayBuffer(4));
    receive(meta("new", 0));
    await flush();
    expect(events).toEqual(["suspend:old"]);
  });

  it("replies file-accept with the store's offset and resumes counting from it", async () => {
    const replies: string[] = [];
    const onStart = vi.fn();
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const resumed: CreateStore = async (m) => ({
      offset: 6,
      write: async () => {},
      finish: async () => new File([], m.name),
      suspend: async () => {},
      abort: async () => {},
    });
    const { handle: receive } = createReceiver(
      { onStart, onProgress, onComplete },
      resumed,
      (msg) => replies.push(msg),
    );
    receive(meta("t", 10));
    await flush();
    expect(JSON.parse(replies[0]!)).toEqual({ type: "file-accept", transferId: "t", offset: 6 });
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ transferId: "t" }), 6);

    receive(new ArrayBuffer(4));
    expect(onProgress).toHaveBeenLastCalledWith(expect.anything(), 10);
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
  });

  it("suspend() keeps the partial file when the channel drops", async () => {
    const suspend = vi.fn(async () => {});
    const store: CreateStore = async (m) => ({
      offset: 0,
      write: async () => {},
      finish: async () => new File([], m.name),
      suspend,
      abort: async () => {},
    });
    const onSuspend = vi.fn();
    const receiver = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn(), onSuspend },
      store,
    );
    receiver.handle(meta("t", 10));
    receiver.handle(new ArrayBuffer(3));
    receiver.suspend();
    await flush();
    expect(suspend).toHaveBeenCalledOnce();
    expect(onSuspend).toHaveBeenCalledWith(expect.objectContaining({ transferId: "t" }));
    receiver.suspend(); // nothing in flight: no-op
    expect(onSuspend).toHaveBeenCalledOnce();
  });

  it("ignores binary data that arrives before any file-meta", () => {
    const onProgress = vi.fn();
    const { handle: receive } = createReceiver({ onStart: vi.fn(), onProgress, onComplete: vi.fn() });
    receive(new ArrayBuffer(8));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("ignores malformed control messages", () => {
    const onStart = vi.fn();
    const { handle: receive } = createReceiver({ onStart, onProgress: vi.fn(), onComplete: vi.fn() });
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

describe("resumable send", () => {
  it("starts streaming from the accepted offset", async () => {
    const sink = new FakeSink();
    const file = makeFile(10);
    const progress: number[] = [];
    await sendFile(sink, file, "t1", (n) => progress.push(n), 4, async () => 6);
    const chunks = sink.sent.slice(1) as ArrayBuffer[];
    expect(chunks.map((c) => c.byteLength)).toEqual([4]);
    expect(new Uint8Array(chunks[0]!)).toEqual(new Uint8Array(await file.slice(6).arrayBuffer()));
    expect(progress).toEqual([6, 10]);
  });

  it("rejects an offset past the end of the file", async () => {
    const sink = new FakeSink();
    await expect(
      sendFile(sink, makeFile(10), "t1", () => {}, 4, async () => 11),
    ).rejects.toThrow("beyond file size");
  });
});

describe("createAcceptRegistry", () => {
  it("resolves the matching waiter with its offset", async () => {
    const accepts = createAcceptRegistry();
    const waiting = accepts.wait("t1");
    accepts.resolve({ type: "file-accept", transferId: "other", offset: 1 });
    accepts.resolve({ type: "file-accept", transferId: "t1", offset: 42 });
    await expect(waiting).resolves.toBe(42);
  });

  it("times out when the receiver never answers", async () => {
    vi.useFakeTimers();
    const accepts = createAcceptRegistry(1_000);
    const waiting = accepts.wait("t1");
    const assertion = expect(waiting).rejects.toThrow("did not accept");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    vi.useRealTimers();
  });

  it("rejects only the waiters of the device whose channel closed", async () => {
    const accepts = createAcceptRegistry();
    const toBob = accepts.wait("a", "bob");
    const toCarol = accepts.wait("b", "carol");
    accepts.rejectPeer("bob", "data channel closed");
    await expect(toBob).rejects.toThrow("data channel closed");
    accepts.resolve({ type: "file-accept", transferId: "b", offset: 0 });
    await expect(toCarol).resolves.toBe(0);
  });

  it("rejects all waiters when the channel closes", async () => {
    const accepts = createAcceptRegistry();
    const a = accepts.wait("a");
    const b = accepts.wait("b");
    accepts.rejectAll("data channel closed");
    await expect(a).rejects.toThrow("data channel closed");
    await expect(b).rejects.toThrow("data channel closed");
  });
});

describe("batched writes", () => {
  const MB = 1024 * 1024;

  function recordingStore(events: string[], bytes?: number[]): CreateStore {
    return async (m) => ({
      offset: 0,
      async write(chunk) {
        events.push(`write:${chunk.byteLength / MB}`);
        if (bytes) for (const b of new Uint8Array(chunk)) bytes.push(b);
      },
      finish: async () => {
        events.push("finish");
        return new File([], m.name);
      },
      suspend: async () => {
        events.push("suspend");
      },
      abort: async () => {},
    });
  }

  it("coalesces chunks into batch-sized writes and flushes the tail on completion", async () => {
    const events: string[] = [];
    const onComplete = vi.fn();
    const { handle } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete },
      recordingStore(events),
      () => {},
      4 * MB,
    );
    handle(meta("t", 10 * MB));
    for (let i = 0; i < 10; i++) handle(new ArrayBuffer(MB));
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(events).toEqual(["write:4", "write:4", "write:2", "finish"]);
  });

  it("keeps bytes in order across batch boundaries", async () => {
    const events: string[] = [];
    const bytes: number[] = [];
    const onComplete = vi.fn();
    const { handle } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete },
      recordingStore(events, bytes),
      () => {},
      3,
    );
    handle(meta("t", 7));
    for (const part of [[0, 1], [2, 3], [4], [5, 6]]) handle(new Uint8Array(part).buffer);
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(bytes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("flushes buffered bytes before suspending so the resume offset is exact", async () => {
    const events: string[] = [];
    const receiver = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn() },
      recordingStore(events),
      () => {},
      4 * MB,
    );
    receiver.handle(meta("t", 10 * MB));
    for (let i = 0; i < 3; i++) receiver.handle(new ArrayBuffer(MB));
    receiver.suspend();
    await vi.waitFor(() => expect(events).toContain("suspend"));
    expect(events).toEqual(["write:3", "suspend"]);
  });
});

describe("cancellation", () => {
  it("fails fast mid-file when a write fails: one error, a cancel to the sender, later chunks ignored", async () => {
    const writes = vi.fn<(chunk: ArrayBuffer) => Promise<void>>().mockRejectedValue(
      new Error("download cancelled in the browser"),
    );
    const abort = vi.fn(async () => {});
    const store: CreateStore = async (m) => ({
      offset: 0,
      write: writes,
      finish: async () => new File([], m.name),
      suspend: async () => {},
      abort,
    });
    const replies: string[] = [];
    const onError = vi.fn();
    const onProgress = vi.fn();
    const { handle } = createReceiver(
      { onStart: vi.fn(), onProgress, onComplete: vi.fn(), onError },
      store,
      (msg) => replies.push(msg),
      1,
    );
    handle(meta("t", 100));
    handle(new ArrayBuffer(10)); // write fails here, long before the file is complete
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    handle(new ArrayBuffer(10));
    await flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(writes).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(replies.map((r) => JSON.parse(r))).toContainEqual({
      type: "transfer-cancel",
      transferId: "t",
      reason: "download cancelled in the browser",
    });
  });

  it("stops sending when the signal aborts", async () => {
    const sink = new FakeSink();
    const controller = new AbortController();
    let sent = 0;
    const done = sendFile(sink, makeFile(100), "t1", (n) => {
      sent = n;
      if (n >= 20) controller.abort(new Error("cancelled by receiver"));
    }, 10, async () => 0, controller.signal);
    await expect(done).rejects.toThrow("cancelled by receiver");
    expect(sent).toBe(20);
    expect(sink.sent.length).toBe(1 + 2); // file-meta + two chunks
  });
});

describe("sender read-ahead", () => {
  it("reads the file in large blocks, not once per chunk, and sends identical bytes", async () => {
    const file = makeFile(10 * 64 * 1024);
    const reads: number[] = [];
    const spied = {
      name: file.name,
      type: file.type,
      size: file.size,
      slice(start: number, end: number) {
        reads.push(end - start);
        return file.slice(start, end);
      },
    };
    const sink = new FakeSink();
    await sendFile(sink, spied, "t1", () => {}, 64 * 1024, async () => 0, undefined, 4 * 64 * 1024);
    expect(reads.length).toBe(3); // 10 chunks in blocks of 4
    const sent = new Uint8Array(await new Blob(sink.sent.slice(1) as ArrayBuffer[]).arrayBuffer());
    expect(sent).toEqual(new Uint8Array(await file.arrayBuffer()));
  });
});

describe("pause and cancel", () => {
  it("holds sending at the gate until it opens", async () => {
    const sink = new FakeSink();
    let open!: () => void;
    let closed = true;
    const gate = () => (closed ? new Promise<void>((r) => (open = r)) : Promise.resolve());
    const done = sendFile(sink, makeFile(30), "t1", () => {}, 10, async () => 0, undefined, 10, gate);
    await flush();
    expect(sink.sent.length).toBe(1); // file-meta only
    closed = false;
    open();
    await done;
    expect(sink.sent.length).toBe(4);
  });

  it("stops a file the sender cancelled, without echoing a cancel back", async () => {
    const replies: string[] = [];
    const abort = vi.fn(async () => {});
    const onError = vi.fn();
    const store: CreateStore = async (m) => ({
      offset: 0,
      write: async () => {},
      finish: async () => new File([], m.name),
      suspend: async () => {},
      abort,
    });
    const { handle } = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn(), onError },
      store,
      (r) => replies.push(r),
    );
    handle(meta("t", 100));
    await flush();
    handle(JSON.stringify({ type: "transfer-cancel", transferId: "t" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(String(onError.mock.calls[0]![1])).toContain("cancelled by sender");
    expect(abort).toHaveBeenCalled();
    expect(replies.filter((r) => r.includes("transfer-cancel"))).toEqual([]);
  });

  it("lets the receiver cancel its current file and tells the sender", async () => {
    const replies: string[] = [];
    const onError = vi.fn();
    const receiver = createReceiver(
      { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn(), onError },
      undefined,
      (r) => replies.push(r),
    );
    receiver.handle(meta("t", 100));
    await flush();
    receiver.cancel("t", "cancelled by you");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(replies.map((r) => JSON.parse(r))).toContainEqual({
      type: "transfer-cancel",
      transferId: "t",
      reason: "cancelled by you",
    });
  });
});
