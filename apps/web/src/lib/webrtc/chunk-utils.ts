import { parsePeerMessage, type FileMeta, type PeerMessage } from "@kasip2p/shared";

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
) {
  sink.bufferedAmountLowThreshold = LOW_WATER_MARK;
  const meta: PeerMessage = {
    type: "file-meta",
    transferId,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    totalChunks: Math.ceil(file.size / chunkSize),
  };
  sink.send(JSON.stringify(meta));

  let offset = 0;
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

export interface ReceiverCallbacks {
  onStart(meta: FileMeta): void;
  onProgress(meta: FileMeta, transferredBytes: number): void;
  onComplete(meta: FileMeta, file: File): void;
}

// One receiver per channel; handles one file at a time in arrival order.
export function createReceiver(callbacks: ReceiverCallbacks) {
  let meta: FileMeta | null = null;
  let chunks: ArrayBuffer[] = [];
  let received = 0;

  return function handleData(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const msg = parsePeerMessage(data);
      if (msg?.type === "file-meta") {
        meta = msg;
        chunks = [];
        received = 0;
        callbacks.onStart(msg);
      }
      return;
    }

    if (!meta) return;

    chunks.push(data);
    received += data.byteLength;
    callbacks.onProgress(meta, received);

    if (chunks.length === meta.totalChunks) {
      const file = new File(chunks, meta.name, { type: meta.mimeType });
      const done = meta;
      meta = null;
      chunks = [];
      callbacks.onComplete(done, file);
    }
  };
}
