// @ts-check
// Turns a stream of received chunks into a normal browser download.
// Page side and protocol: src/lib/transfer/download-worker.ts. Typed via tsconfig.sw.json.

/** @typedef {{ type: "open"; id: string; headers: Record<string, string> } | { type: "keepalive" }} WorkerMessage */
/** @typedef {{ type: "chunk"; chunk: ArrayBuffer } | { type: "end" } | { type: "abort" }} PortMessage */
/**
 * @typedef {object} Download
 * @property {Record<string, string>} headers
 * @property {MessagePort} port
 * @property {Uint8Array[]} queue  received but not yet read by the browser
 * @property {boolean} ended
 * @property {boolean} aborted
 * @property {number} delivered  bytes the browser has read
 * @property {(() => void) | null} wake
 */

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

/** @type {Map<string, Download>} */
const downloads = new Map();

sw.addEventListener("install", () => sw.skipWaiting());
sw.addEventListener("activate", (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener("message", (event) => {
  const data = /** @type {WorkerMessage | undefined} */ (event.data);
  // keepalive messages exist only to extend this worker's lifetime
  const port = event.ports[0];
  if (data?.type !== "open" || !port) return;

  /** @type {Download} */
  const download = {
    headers: data.headers,
    port,
    queue: [],
    ended: false,
    aborted: false,
    delivered: 0,
    wake: null,
  };
  port.onmessage = ({ data: raw }) => {
    const msg = /** @type {PortMessage} */ (raw);
    if (msg.type === "chunk") download.queue.push(new Uint8Array(msg.chunk));
    else if (msg.type === "end") download.ended = true;
    else if (msg.type === "abort") download.aborted = true;
    download.wake?.();
  };
  downloads.set(data.id, download);
  port.postMessage({ type: "ready", url: sw.registration.scope + data.id });
});

/**
 * Pull-based: data leaves the queue only as the browser reads it, so a download
 * the browser drops before its first byte loses nothing and can be retried.
 * @param {string} id
 * @param {Download} d
 */
function bodyFor(id, d) {
  return new ReadableStream(
    {
      async pull(controller) {
        while (!d.queue.length && !d.ended && !d.aborted) {
          await new Promise((resolve) => (d.wake = () => resolve(undefined)));
        }
        d.wake = null;
        if (d.aborted) {
          downloads.delete(id);
          controller.error(new Error("transfer aborted"));
          return;
        }
        const chunk = d.queue.shift();
        if (d.delivered === 0) d.port.postMessage({ type: "started" });
        if (chunk) {
          d.delivered += chunk.byteLength;
          controller.enqueue(chunk);
          return;
        }
        downloads.delete(id); // ended and drained
        controller.close();
      },
      cancel() {
        if (d.delivered === 0) {
          d.port.postMessage({ type: "blocked" }); // keep it for a retry
          return;
        }
        downloads.delete(id);
        d.port.postMessage({ type: "cancelled" });
      },
    },
    { highWaterMark: 0 },
  );
}

sw.addEventListener("fetch", (event) => {
  const scope = new URL(sw.registration.scope).pathname;
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(scope)) return;
  const id = url.pathname.slice(scope.length);
  const download = downloads.get(id);
  // once bytes have flowed the body is spoken for; a second fetch gets a 404
  if (!download || download.delivered > 0) return;
  event.respondWith(new Response(bodyFor(id, download), { headers: download.headers }));
});
