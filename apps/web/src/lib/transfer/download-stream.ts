import type { FileMeta } from "@kasip2p/shared";
import type { CreateStore, IncomingFileStore } from "./file-store";

// One browser download fed chunk by chunk (see public/download-sw.js).
export interface DownloadSink {
  write(chunk: ArrayBuffer): void;
  close(): void;
  abort(): void;
  onCancel: (() => void) | null; // user cancelled it in the browser
  onBlocked: (() => void) | null; // browser dropped it before reading a byte
  readonly started: Promise<void>; // the browser has read the first byte
  retry(): void; // start it again; must run inside a user click
}

export interface BlockedDownloadHooks {
  startTimeoutMs?: number;
  // Chrome may block automatic downloads; save() restarts it from a click
  onBlocked?(meta: FileMeta, save: () => void): void;
  onUnblocked?(transferId: string): void; // started or abandoned after being blocked
}

export const START_TIMEOUT_MS = 2_000;

export const RESUME_WINDOW_MS = 3 * 60_000;

// RFC 5987 also wants these encoded; encodeURIComponent leaves them alone.
const encodeRfc5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// Name and type come from the peer: always a sandboxed octet-stream attachment.
export function downloadHeaders(meta: FileMeta): Record<string, string> {
  const ascii = meta.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(meta.size),
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(meta.name)}`,
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
  };
}

interface Held {
  meta: FileMeta;
  sink: DownloadSink;
  written: number;
  timer: ReturnType<typeof setTimeout>;
}

// Stores that stream straight into browser downloads; a suspended one is held
// open for resumeWindowMs so a resumed transfer continues the same download.
export function createStreamDownloads(
  open: (meta: FileMeta) => Promise<DownloadSink>,
  resumeWindowMs = RESUME_WINDOW_MS,
  hooks: BlockedDownloadHooks = {},
): CreateStore {
  const held = new Map<string, Held>();
  const startTimeoutMs = hooks.startTimeoutMs ?? START_TIMEOUT_MS;

  // Fresh downloads only (a resumed one already started). The clock starts with
  // the first data, so a slow sender is not mistaken for a blocked download.
  function watchStart(meta: FileMeta, sink: DownloadSink) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    let blocked = false;
    const block = () => {
      if (started || blocked) return;
      clearTimeout(timer);
      blocked = true;
      hooks.onBlocked?.(meta, () => sink.retry());
    };
    const clear = () => {
      clearTimeout(timer);
      if (blocked) hooks.onUnblocked?.(meta.transferId);
      blocked = false;
    };
    sink.onBlocked = block;
    void sink.started.then(() => {
      started = true;
      clear();
    });
    return {
      dataArrived() {
        if (timer === undefined && !started && !blocked) {
          timer = setTimeout(block, startTimeoutMs);
        }
      },
      clear,
    };
  }
  type Watch = ReturnType<typeof watchStart>;
  const unwatched: Watch = { dataArrived() {}, clear() {} };

  function storeFor(
    meta: FileMeta,
    sink: DownloadSink,
    startAt: number,
    watch: Watch = unwatched,
  ): IncomingFileStore {
    let written = startAt;
    let cancelled = false;
    sink.onCancel = () => {
      cancelled = true;
    };
    return {
      offset: startAt,
      async write(chunk) {
        if (cancelled) throw new Error("download cancelled in the browser");
        sink.write(chunk);
        written += chunk.byteLength;
        watch.dataArrived();
      },
      async finish() {
        watch.dataArrived(); // an empty file still has to be saved
        sink.close();
        return null;
      },
      async suspend() {
        const timer = setTimeout(() => {
          held.delete(meta.transferId);
          sink.abort();
        }, resumeWindowMs);
        held.set(meta.transferId, { meta, sink, written, timer });
      },
      async abort() {
        watch.clear();
        sink.abort();
      },
    };
  }

  return async (meta) => {
    const prior = held.get(meta.transferId);
    if (prior) {
      clearTimeout(prior.timer);
      held.delete(meta.transferId);
      if (prior.meta.size === meta.size && prior.meta.name === meta.name) {
        return storeFor(meta, prior.sink, prior.written);
      }
      prior.sink.abort();
    }
    const sink = await open(meta);
    return storeFor(meta, sink, 0, watchStart(meta, sink));
  };
}
