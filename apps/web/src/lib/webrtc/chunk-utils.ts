import {
  parsePeerMessage,
  type FileAccept,
  type FileMeta,
  type PeerMessage,
} from "@kasip2p/shared";
import { memoryStore, type CreateStore, type IncomingFileStore } from "@/lib/transfer/file-store";

export const DEFAULT_CHUNK_SIZE = 64 * 1024;
const MAX_CHUNK_SIZE = 256 * 1024;
export const HIGH_WATER_MARK = 2 * 1024 * 1024;
export const LOW_WATER_MARK = 512 * 1024;
// Disk reads happen per block, prefetched while the previous block is sent.
export const READ_BLOCK_SIZE = 4 * 1024 * 1024;

// The subset of RTCDataChannel the transfer code needs; lets tests use a fake.
export interface ChunkSink {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
  readonly readyState: RTCDataChannelState;
  bufferedAmountLowThreshold: number;
  addEventListener(type: "bufferedamountlow" | "close", listener: () => void): void;
  removeEventListener(type: "bufferedamountlow" | "close", listener: () => void): void;
}

export interface SendableFile {
  name: string;
  type: string;
  size: number;
  slice(start: number, end: number): Blob;
}

// Largest chunk the remote accepts, capped at a size every browser handles well.
export function chooseChunkSize(maxMessageSize: number | undefined): number {
  if (!maxMessageSize || !Number.isFinite(maxMessageSize)) return DEFAULT_CHUNK_SIZE;
  return Math.min(MAX_CHUNK_SIZE, maxMessageSize);
}

// Resolves once the send buffer drains below the low-water mark; rejects on close or abort.
function drained(sink: ChunkSink, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sink.removeEventListener("bufferedamountlow", onLow);
      sink.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort);
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("data channel closed"));
    };
    sink.addEventListener("bufferedamountlow", onLow);
    sink.addEventListener("close", onClose);
  });
}

export async function sendFile(
  sink: ChunkSink,
  file: SendableFile,
  transferId: string,
  onProgress: (transferredBytes: number) => void,
  chunkSize = DEFAULT_CHUNK_SIZE,
  waitForAccept: (transferId: string) => Promise<number> = async () => 0,
  signal?: AbortSignal, // aborted when either side cancels; rejects with its reason
  readBlockSize = READ_BLOCK_SIZE,
  gate?: () => Promise<void>, // resolves while unpaused; checked before each chunk
) {
  sink.bufferedAmountLowThreshold = LOW_WATER_MARK;
  const accepted = waitForAccept(transferId); // registered before file-meta goes out
  const meta: PeerMessage = {
    type: "file-meta",
    transferId,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    totalChunks: Math.ceil(file.size / chunkSize),
  };
  sink.send(JSON.stringify(meta));

  let offset = await accepted;
  if (offset > file.size) throw new Error(`receiver offset ${offset} beyond file size`);
  if (offset > 0) onProgress(offset);
  // whole chunks per block, so chunk boundaries match the unbuffered layout
  const block = Math.max(chunkSize, Math.floor(readBlockSize / chunkSize) * chunkSize);
  const read = (from: number) => file.slice(from, Math.min(from + block, file.size)).arrayBuffer();
  let next = offset < file.size ? read(offset) : null;
  while (next) {
    const data = await next;
    const blockEnd = offset + data.byteLength;
    next = blockEnd < file.size ? read(blockEnd) : null; // prefetch while sending this one
    next?.catch(() => {}); // surfaced when awaited
    for (let at = 0; at < data.byteLength; ) {
      signal?.throwIfAborted();
      if (gate) await gate();
      signal?.throwIfAborted();
      if (sink.readyState !== "open") throw new Error("data channel closed");
      if (sink.bufferedAmount > HIGH_WATER_MARK) {
        await drained(sink, signal);
        continue;
      }
      const chunk = data.slice(at, at + chunkSize);
      sink.send(chunk);
      at += chunk.byteLength;
      offset += chunk.byteLength;
      onProgress(offset);
    }
  }
}

export const ACCEPT_TIMEOUT_MS = 10_000;

// Pairs each outgoing file-meta with the receiver's file-accept reply.
export function createAcceptRegistry(timeoutMs = ACCEPT_TIMEOUT_MS) {
  const waiters = new Map<
    string,
    {
      peerId: string | undefined;
      resolve(offset: number): void;
      reject(err: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function rejectWhere(match: (peerId: string | undefined) => boolean, reason: string) {
    for (const [id, waiter] of waiters) {
      if (!match(waiter.peerId)) continue;
      clearTimeout(waiter.timer);
      waiters.delete(id);
      waiter.reject(new Error(reason));
    }
  }

  return {
    wait(transferId: string, peerId?: string): Promise<number> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(transferId);
          reject(new Error("receiver did not accept the file"));
        }, timeoutMs);
        waiters.set(transferId, { peerId, resolve, reject, timer });
      });
    },
    resolve(msg: FileAccept) {
      const waiter = waiters.get(msg.transferId);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      waiters.delete(msg.transferId);
      waiter.resolve(msg.offset);
    },
    rejectPeer(peerId: string, reason: string) {
      rejectWhere((p) => p === peerId, reason);
    },
    rejectAll(reason: string) {
      rejectWhere(() => true, reason);
    },
  };
}

export interface ReceiverCallbacks {
  onStart(meta: FileMeta, offset: number): void;
  onProgress(meta: FileMeta, transferredBytes: number): void;
  // file is null when the store already delivered it (streamed download)
  onComplete(meta: FileMeta, file: File | null): void | Promise<void>;
  onError?(meta: FileMeta, error: unknown): void;
  onSuspend?(meta: FileMeta): void; // interrupted; partial kept for a resume
}

interface Incoming {
  meta: FileMeta;
  store: Promise<IncomingFileStore>;
  received: number;
  writes: Promise<void>; // chained so chunks hit the store strictly in order
  pending: ArrayBuffer[]; // not yet handed to the store
  pendingBytes: number;
  failed: boolean;
}

// Fewer, larger store writes: per-write overhead dominates at 64KB chunks.
export const WRITE_BATCH_BYTES = 4 * 1024 * 1024;

function concat(chunks: ArrayBuffer[], total: number): ArrayBuffer {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), at);
    at += c.byteLength;
  }
  return out.buffer;
}

// One receiver per channel; handles one file at a time in arrival order.
export function createReceiver(
  callbacks: ReceiverCallbacks,
  createStore: CreateStore = memoryStore,
  reply: (message: string) => void = () => {},
  batchBytes = WRITE_BATCH_BYTES,
) {
  let current: Incoming | null = null;

  // Any failure ends the file at once: report it, discard it, tell the sender to stop.
  // notifyPeer is false when the sender itself cancelled.
  function fail(incoming: Incoming, err: unknown, notifyPeer = true) {
    if (incoming.failed) return;
    incoming.failed = true;
    if (current === incoming) current = null;
    incoming.pending = [];
    incoming.pendingBytes = 0;
    callbacks.onError?.(incoming.meta, err);
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    if (notifyPeer) {
      reply(JSON.stringify({ type: "transfer-cancel", transferId: incoming.meta.transferId, reason }));
    }
    void incoming.store.then((store) => store.abort()).catch(() => {});
  }

  function enqueue(incoming: Incoming, op: (store: IncomingFileStore) => Promise<void>) {
    incoming.writes = incoming.writes
      .then(async () => {
        if (!incoming.failed) await op(await incoming.store);
      })
      .catch((err) => fail(incoming, err));
  }

  function flush(incoming: Incoming) {
    if (incoming.pendingBytes === 0) return;
    const batch = concat(incoming.pending, incoming.pendingBytes);
    incoming.pending = [];
    incoming.pendingBytes = 0;
    enqueue(incoming, (store) => store.write(batch));
  }

  // Completion is by byte count, so empty files finish on their file-meta alone.
  function completeIfDone(incoming: Incoming) {
    if (current !== incoming || incoming.received < incoming.meta.size) return;
    current = null;
    flush(incoming);
    incoming.writes
      .then(async () => {
        if (incoming.failed) return;
        const file = await (await incoming.store).finish();
        await callbacks.onComplete(incoming.meta, file);
      })
      .catch((err) => fail(incoming, err));
  }

  function start(meta: FileMeta) {
    if (current) suspend();
    const incoming: Incoming = {
      meta,
      store: createStore(meta),
      received: 0,
      writes: Promise.resolve(),
      pending: [],
      pendingBytes: 0,
      failed: false,
    };
    current = incoming;
    // tell the sender where to start; a resumed file skips what we already hold
    incoming.writes = incoming.store.then((store) => {
      incoming.received += store.offset;
      reply(JSON.stringify({ type: "file-accept", transferId: meta.transferId, offset: store.offset }));
      callbacks.onStart(meta, store.offset);
      completeIfDone(incoming);
    });
    incoming.writes = incoming.writes.catch((err) => fail(incoming, err));
  }

  // Channel went away: keep the partial file so the same transfer can resume.
  function suspend() {
    const incoming = current;
    if (!incoming) return;
    current = null;
    flush(incoming);
    enqueue(incoming, (store) => store.suspend());
    callbacks.onSuspend?.(incoming.meta);
  }

  function handle(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const msg = parsePeerMessage(data);
      if (msg?.type === "file-meta") start(msg);
      else if (msg?.type === "transfer-cancel" && current?.meta.transferId === msg.transferId) {
        const why = msg.reason ? `: ${msg.reason}` : "";
        fail(current, new Error(`cancelled by sender${why}`), false);
      }
      return;
    }

    const incoming = current;
    if (!incoming) return;
    incoming.received += data.byteLength;
    incoming.pending.push(data);
    incoming.pendingBytes += data.byteLength;
    if (incoming.pendingBytes >= batchBytes) flush(incoming);
    callbacks.onProgress(incoming.meta, incoming.received);
    completeIfDone(incoming);
  }

  // The user cancelled on the receiving side.
  function cancel(transferId: string, reason = "cancelled by receiver") {
    if (current?.meta.transferId === transferId) fail(current, new Error(reason));
  }

  return { handle, suspend, cancel };
}
