import type { FileMeta } from "@kasip2p/shared";

// Where an incoming file's bytes go while it is being received.
export interface IncomingFileStore {
  write(chunk: ArrayBuffer): Promise<void>;
  finish(): Promise<File>;
  abort(): Promise<void>;
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
    async write(chunk) {
      chunks.push(chunk);
    },
    async finish() {
      const file = new File(chunks, meta.name, { type: meta.mimeType });
      chunks = [];
      return file;
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

// Streams to the origin-private file system so large files never sit in memory.
export async function opfsStore(meta: FileMeta): Promise<IncomingFileStore> {
  const dir = await incomingDir();
  const handle = await dir.getFileHandle(meta.transferId, { create: true });
  const writable = await handle.createWritable();
  return {
    write: (chunk) => writable.write(chunk),
    async finish() {
      await writable.close();
      const onDisk = await handle.getFile();
      // wraps the disk-backed blob with the real name; no copy into memory
      return new File([onDisk], meta.name, { type: meta.mimeType });
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

export const createIncomingStore: CreateStore = async (meta) => {
  if (opfsSupported()) {
    try {
      return await opfsStore(meta);
    } catch (err) {
      console.warn("OPFS unavailable, receiving in memory", err);
    }
  }
  return memoryStore(meta);
};

// Deletes the temp file once the transfer is saved elsewhere (or abandoned).
export async function removeIncoming(transferId: string) {
  if (!opfsSupported()) return;
  try {
    const dir = await incomingDir();
    await dir.removeEntry(transferId);
  } catch {
    // already gone
  }
}
