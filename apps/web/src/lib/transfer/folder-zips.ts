import type { FolderPart } from "@kasip2p/shared";
import type { CreateStore, IncomingFileStore } from "./file-store";
import { RESUME_WINDOW_MS } from "./download-stream";
import { createZipWriter } from "./zip";

interface Session {
  folder: FolderPart;
  container: IncomingFileStore;
  zip: ReturnType<typeof createZipWriter>;
  writes: Promise<void>; // container writes, in zip order
  next: number; // index of the next file expected
  entry: { transferId: string; written: number } | null;
  timer?: ReturnType<typeof setTimeout>;
}

// A folder's files (sent in index order) become entries of one zip download,
// written through a single base store. Loose files go straight to the base.
export function createFolderZips(base: CreateStore, resumeWindowMs = RESUME_WINDOW_MS): CreateStore {
  const sessions = new Map<string, Session>();

  function drop(session: Session) {
    clearTimeout(session.timer);
    sessions.delete(session.folder.id);
    void session.container.abort().catch(() => {});
  }

  async function open(folder: FolderPart): Promise<Session> {
    const container = await base({
      type: "file-meta",
      transferId: folder.id,
      name: `${folder.name}.zip`,
      size: 0,
      mimeType: "application/zip",
      totalChunks: 0,
      lengthUnknown: true,
    });
    const session: Session = {
      folder,
      container,
      writes: Promise.resolve(),
      next: 0,
      entry: null,
      zip: createZipWriter((bytes) => {
        session.writes = session.writes.then(() => container.write(bytes));
      }),
    };
    sessions.set(folder.id, session);
    return session;
  }

  function storeFor(session: Session): IncomingFileStore {
    const entry = session.entry!;
    return {
      offset: entry.written,
      async write(chunk) {
        const len = chunk.byteLength;
        session.zip.data(chunk); // hands the chunk on; read its length first
        entry.written += len;
        await session.writes;
      },
      async finish() {
        session.zip.end();
        session.entry = null;
        session.next += 1;
        if (session.next < session.folder.count) {
          await session.writes;
          return null;
        }
        session.zip.close();
        await session.writes;
        sessions.delete(session.folder.id);
        return session.container.finish();
      },
      // keep the open entry so the same file can continue where it stopped
      async suspend() {
        clearTimeout(session.timer);
        session.timer = setTimeout(() => drop(session), resumeWindowMs);
      },
      async abort() {
        drop(session);
      },
    };
  }

  return async (meta) => {
    const folder = meta.folder;
    if (!folder) return base(meta);

    let session = sessions.get(folder.id);
    if (session?.entry?.transferId === meta.transferId) {
      clearTimeout(session.timer);
      return storeFor(session);
    }
    if (!session) {
      if (folder.index !== 0) throw new Error("folder is no longer being received");
      session = await open(folder);
    }
    if (session.entry || folder.index !== session.next) {
      drop(session);
      throw new Error("folder files arrived out of order");
    }
    session.zip.begin(folder.path, meta.size);
    session.entry = { transferId: meta.transferId, written: 0 };
    return storeFor(session);
  };
}
