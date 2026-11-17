import type { FileMeta } from "@kasip2p/shared";
import { generateId } from "@/lib/utils";
import { downloadHeaders, type DownloadSink } from "./download-stream";

const SCRIPT = "/download-sw.js";
const SCOPE = "/__downloads/";
const KEEPALIVE_MS = 10_000;
const READY_TIMEOUT_MS = 3_000;

// Safari ignores attachment headers on worker responses; it uses the fallback.
function streamingSupported(): boolean {
  if (typeof window === "undefined" || !window.isSecureContext) return false;
  if (!("serviceWorker" in navigator)) return false;
  return !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function registerDownloadWorker() {
  if (!streamingSupported()) return;
  navigator.serviceWorker.register(SCRIPT, { scope: SCOPE }).catch((err) => {
    console.warn("download worker unavailable; using fallback downloads", err);
  });
}

async function activeWorker(): Promise<ServiceWorker | null> {
  if (!streamingSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  if (!reg) return null;
  if (reg.active) return reg.active;
  const pending = reg.installing ?? reg.waiting;
  if (!pending) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), READY_TIMEOUT_MS);
    pending.addEventListener("statechange", () => {
      if (pending.state !== "activated") return;
      clearTimeout(timer);
      resolve(pending);
    });
  });
}

export async function streamDownloadsAvailable(): Promise<boolean> {
  return (await activeWorker()) !== null;
}

// A worker idles out after ~30s without events; port messages do not count.
let openSinks = 0;
let keepalive: ReturnType<typeof setInterval> | null = null;
function trackOpen(worker: ServiceWorker, delta: 1 | -1) {
  openSinks += delta;
  if (openSinks > 0 && !keepalive) {
    keepalive = setInterval(() => worker.postMessage({ type: "keepalive" }), KEEPALIVE_MS);
  } else if (openSinks === 0 && keepalive) {
    clearInterval(keepalive);
    keepalive = null;
  }
}

// Starts a browser download (hidden iframe) whose body is fed by the returned sink.
export async function openWorkerDownload(meta: FileMeta): Promise<DownloadSink> {
  const worker = await activeWorker();
  if (!worker) throw new Error("download worker not active");

  const { port1, port2 } = new MessageChannel();
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("download worker did not answer")), READY_TIMEOUT_MS);
    port1.onmessage = ({ data }) => {
      if (data?.type !== "ready") return;
      clearTimeout(timer);
      resolve(data.url);
    };
    worker.postMessage({ type: "open", id: generateId(), headers: downloadHeaders(meta) }, [
      port2,
    ]);
  });

  // each attempt gets its own hidden iframe; a retry runs inside the user's click
  const frames: HTMLIFrameElement[] = [];
  let attempt = 0;
  const navigate = () => {
    const iframe = document.createElement("iframe");
    iframe.hidden = true;
    iframe.src = attempt === 0 ? url : `${url}?attempt=${attempt}`;
    attempt += 1;
    document.body.appendChild(iframe);
    frames.push(iframe);
  };
  navigate();
  trackOpen(worker, 1);

  let done = false;
  const end = (msg: { type: "end" } | { type: "abort" }) => {
    if (done) return;
    done = true;
    port1.postMessage(msg);
    trackOpen(worker, -1);
    // the download outlives its iframe once started; keep them a moment to be safe
    setTimeout(() => frames.forEach((f) => f.remove()), 30_000);
  };

  let markStarted!: () => void;
  const sink: DownloadSink = {
    onCancel: null,
    onBlocked: null,
    started: new Promise<void>((resolve) => (markStarted = resolve)),
    retry: navigate,
    write(chunk) {
      port1.postMessage({ type: "chunk", chunk }, [chunk]);
    },
    close: () => end({ type: "end" }),
    abort: () => end({ type: "abort" }),
  };
  port1.onmessage = ({ data }) => {
    if (data?.type === "started") markStarted();
    else if (data?.type === "blocked") sink.onBlocked?.();
    else if (data?.type === "cancelled") sink.onCancel?.();
  };
  return sink;
}
