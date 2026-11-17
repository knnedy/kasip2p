import type { FileMeta } from "@kasip2p/shared";
import { clearPartials, deletePartial, getPartial, savePartial } from "@/lib/store/idb";
import { createStreamDownloads } from "./download-stream";
import { openWorkerDownload, streamDownloadsAvailable } from "./download-worker";

// Where an incoming file's bytes go while it is being received.
export interface IncomingFileStore {
  readonly offset: number; // bytes already held from an earlier attempt
  write(chunk: ArrayBuffer): Promise<void>;
  finish(): Promise<File | null>; // null: already delivered to the user (streamed)
  suspend(): Promise<void>; // keep what we have for a later resume
  abort(): Promise<void>; // discard everything
}

export type CreateStore = (meta: FileMeta) => Promise<IncomingFileStore>;

const INCOMING_DIR = "incoming";
const LARGE_IN_MEMORY = 500 * 1024 * 1024;

export async function memoryStore(meta: FileMeta): Promise<IncomingFileStore> {
  if (meta.size > LARGE_IN_MEMORY) {
    console.warn(`receiving ${meta.name} in memory; this browser has no OPFS`);
  }
  let chunks: ArrayBuffer[] = [];
  return {
    offset: 0,
    async write(chunk) {
      chunks.push(chunk);
    },
    async finish() {
      const file = new File(chunks, meta.name, { type: meta.mimeType });
      chunks = [];
      return file;
    },
    async suspend() {
      chunks = [];
    },
    async abort() {
      chunks = [];
    },
  };
}

async function incomingDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(INCOMING_DIR, { create: true });
}

// Bytes already on disk from an earlier attempt at the same file, else 0.
async function resumableOffset(
  meta: FileMeta,
  handle: FileSystemFileHandle,
): Promise<number> {
  const partial = await getPartial(meta.transferId);
  if (!partial || partial.size !== meta.size || partial.name !== meta.name) return 0;
  const onDisk = (await handle.getFile()).size;
  return onDisk <= meta.size ? onDisk : 0;
}

// Streams to the origin-private file system so large files never sit in memory.
export async function opfsStore(meta: FileMeta): Promise<IncomingFileStore> {
  const dir = await incomingDir();
  const handle = await dir.getFileHandle(meta.transferId, { create: true });
  const offset = await resumableOffset(meta, handle);
  const writable = await handle.createWritable({ keepExistingData: offset > 0 });
  if (offset > 0) {
    await writable.truncate(offset);
    await writable.seek(offset);
  }
  await savePartial({ transferId: meta.transferId, name: meta.name, size: meta.size });

  return {
    offset,
    write: (chunk) => writable.write(chunk),
    async finish() {
      await writable.close();
      await deletePartial(meta.transferId);
      const onDisk = await handle.getFile();
      // wraps the disk-backed blob with the real name; no copy into memory
      return new File([onDisk], meta.name, { type: meta.mimeType });
    },
    // writes land in a swap file until close(), so close to keep them
    async suspend() {
      await writable.close().catch(() => {});
    },
    async abort() {
      await writable.abort().catch(() => {});
      await removeIncoming(meta.transferId);
    },
  };
}

function opfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

const streamed = createStreamDownloads(openWorkerDownload);

// Best first: stream into a browser download; else stage on disk (OPFS), else memory.
export const createIncomingStore: CreateStore = async (meta) => {
  if (await streamDownloadsAvailable()) {
    try {
      return await streamed(meta);
    } catch (err) {
      console.warn("streamed download failed to start, staging instead", err);
    }
  }
  if (opfsSupported()) {
    try {
      return await opfsStore(meta);
    } catch (err) {
      console.warn("OPFS unavailable, receiving in memory", err);
    }
  }
  return memoryStore(meta);
};

// The browser copies a blob-URL download lazily, so the staged file must outlive it.
const RELEASE_BASE_MS = 60_000;
const RELEASE_MIN_RATE = 20 * 1024 * 1024; // bytes/s assumed for the copy

export function releaseAfterDownload(transferId: string, size: number) {
  const delay = RELEASE_BASE_MS + (size / RELEASE_MIN_RATE) * 1000;
  setTimeout(() => void removeIncoming(transferId), delay);
}

// Resume is per session, so anything staged by an earlier session is garbage.
export async function clearStaleIncoming() {
  await clearPartials().catch(() => {});
  if (!opfsSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(INCOMING_DIR, { recursive: true });
  } catch {
    // nothing staged
  }
}

// Deletes the temp file and manifest once saved elsewhere (or abandoned).
export async function removeIncoming(transferId: string) {
  await deletePartial(transferId).catch(() => {});
  if (!opfsSupported()) return;
  try {
    const dir = await incomingDir();
    await dir.removeEntry(transferId);
  } catch {
    // already gone
  }
}
