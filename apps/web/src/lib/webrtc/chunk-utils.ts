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

// Resolves once the send buffer drains below the low-water mark; rejects if the channel closes.
function drained(sink: ChunkSink): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sink.removeEventListener("bufferedamountlow", onLow);
      sink.removeEventListener("close", onClose);
    };
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
  while (offset < file.size) {
    if (sink.readyState !== "open") throw new Error("data channel closed");
    if (sink.bufferedAmount > HIGH_WATER_MARK) {
      await drained(sink);
      continue;
    }
    const buffer = await file.slice(offset, offset + chunkSize).arrayBuffer();
    sink.send(buffer);
    offset += buffer.byteLength;
    onProgress(offset);
  }
}

export const ACCEPT_TIMEOUT_MS = 10_000;

// Pairs each outgoing file-meta with the receiver's file-accept reply.
export function createAcceptRegistry(timeoutMs = ACCEPT_TIMEOUT_MS) {
  const waiters = new Map<
    string,
    { resolve(offset: number): void; reject(err: Error): void; timer: ReturnType<typeof setTimeout> }
  >();

  return {
    wait(transferId: string): Promise<number> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(transferId);
          reject(new Error("receiver did not accept the file"));
        }, timeoutMs);
        waiters.set(transferId, { resolve, reject, timer });
      });
    },
    resolve(msg: FileAccept) {
      const waiter = waiters.get(msg.transferId);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      waiters.delete(msg.transferId);
      waiter.resolve(msg.offset);
    },
    rejectAll(reason: string) {
      for (const [id, waiter] of waiters) {
        clearTimeout(waiter.timer);
        waiters.delete(id);
        waiter.reject(new Error(reason));
      }
    },
  };
}

export interface ReceiverCallbacks {
  onStart(meta: FileMeta, offset: number): void;
  onProgress(meta: FileMeta, transferredBytes: number): void;
  onComplete(meta: FileMeta, file: File): void | Promise<void>;
  onError?(meta: FileMeta, error: unknown): void;
}

interface Incoming {
  meta: FileMeta;
  store: Promise<IncomingFileStore>;
  received: number;
  writes: Promise<void>; // chained so chunks hit the store strictly in order
}

// One receiver per channel; handles one file at a time in arrival order.
export function createReceiver(
  callbacks: ReceiverCallbacks,
  createStore: CreateStore = memoryStore,
  reply: (message: string) => void = () => {},
) {
  let current: Incoming | null = null;

  function enqueue(incoming: Incoming, op: (store: IncomingFileStore) => Promise<void>) {
    incoming.writes = incoming.writes.then(async () => op(await incoming.store));
  }

  // Completion is by byte count, so empty files finish on their file-meta alone.
  function completeIfDone(incoming: Incoming) {
    if (current !== incoming || incoming.received < incoming.meta.size) return;
    current = null;
    incoming.writes
      .then(async () => {
        const file = await (await incoming.store).finish();
        await callbacks.onComplete(incoming.meta, file);
      })
      .catch(async (err) => {
        callbacks.onError?.(incoming.meta, err);
        await (await incoming.store).abort().catch(() => {});
      });
  }

  function start(meta: FileMeta) {
    if (current) suspend();
    const incoming: Incoming = {
      meta,
      store: createStore(meta),
      received: 0,
      writes: Promise.resolve(),
    };
    current = incoming;
    // tell the sender where to start; a resumed file skips what we already hold
    incoming.writes = incoming.store.then((store) => {
      incoming.received += store.offset;
      reply(JSON.stringify({ type: "file-accept", transferId: meta.transferId, offset: store.offset }));
      callbacks.onStart(meta, store.offset);
      completeIfDone(incoming);
    });
    incoming.writes.catch((err) => {
      if (current === incoming) current = null;
      callbacks.onError?.(meta, err);
    });
  }

  // Channel went away: keep the partial file so the same transfer can resume.
  function suspend() {
    const incoming = current;
    if (!incoming) return;
    current = null;
    enqueue(incoming, (store) => store.suspend());
  }

  function handle(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const msg = parsePeerMessage(data);
      if (msg?.type === "file-meta") start(msg);
      return;
    }

    const incoming = current;
    if (!incoming) return;
    incoming.received += data.byteLength;
    enqueue(incoming, (store) => store.write(data));
    callbacks.onProgress(incoming.meta, incoming.received);
    completeIfDone(incoming);
  }

  return { handle, suspend };
}
