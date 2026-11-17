// @ts-check
// Turns a stream of received chunks into a normal browser download.
// Page side and protocol: src/lib/transfer/download-worker.ts. Typed via tsconfig.sw.json.

/** @typedef {{ type: "open"; id: string; headers: Record<string, string> } | { type: "keepalive" }} WorkerMessage */
/** @typedef {{ type: "chunk"; chunk: ArrayBuffer } | { type: "end" } | { type: "abort" }} PortMessage */

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

/** @type {Map<string, { stream: ReadableStream<Uint8Array>; headers: Record<string, string> }>} */
const downloads = new Map();

sw.addEventListener("install", () => sw.skipWaiting());
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener("message", (event) => {
  const data = /** @type {WorkerMessage | undefined} */ (event.data);
  // keepalive messages exist only to extend this worker's lifetime
  const port = event.ports[0];
  if (data?.type !== "open" || !port) return;
  const { id, headers } = data;

  /** @type {ReadableStreamDefaultController<Uint8Array> | undefined} */
  let controller;
  /** @type {ReadableStream<Uint8Array>} */
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      downloads.delete(id);
      port.postMessage({ type: "cancelled" });
    },
  });

  port.onmessage = ({ data: raw }) => {
    const msg = /** @type {PortMessage} */ (raw);
    try {
      if (msg.type === "chunk") controller?.enqueue(new Uint8Array(msg.chunk));
      else if (msg.type === "end") controller?.close();
      else if (msg.type === "abort") controller?.error(new Error("transfer aborted"));
    } catch {
      // stream already closed or cancelled
    }
  };

  downloads.set(id, { stream, headers });
  port.postMessage({ type: "ready", url: sw.registration.scope + id });
});

sw.addEventListener("fetch", (event) => {
  const scope = new URL(sw.registration.scope).pathname;
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(scope)) return;
  const id = url.pathname.slice(scope.length);
  const download = downloads.get(id);
  if (!download) return;
  downloads.delete(id); // single use
  event.respondWith(new Response(download.stream, { headers: download.headers }));
});
