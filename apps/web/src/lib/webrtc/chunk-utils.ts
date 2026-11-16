import { parsePeerMessage, type FileMeta, type PeerMessage } from "@kasip2p/shared";

export const CHUNK_SIZE = 64 * 1024;
const MAX_BUFFERED = 16 * 1024 * 1024;

// The subset of RTCDataChannel the transfer code needs; lets tests use a fake.
export interface ChunkSink {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
}

export interface SendableFile {
  name: string;
  type: string;
  size: number;
  slice(start: number, end: number): Blob;
}

export async function sendFile(
  sink: ChunkSink,
  file: SendableFile,
  transferId: string,
  onProgress: (transferredBytes: number) => void,
) {
  const meta: PeerMessage = {
    type: "file-meta",
    transferId,
    name: file.name,
    size: file.size,
    mimeType: file.type,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE),
  };
  sink.send(JSON.stringify(meta));

  let offset = 0;
  while (offset < file.size) {
    if (sink.bufferedAmount > MAX_BUFFERED) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
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
