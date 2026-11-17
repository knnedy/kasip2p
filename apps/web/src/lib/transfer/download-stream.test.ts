import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileMeta } from "@kasip2p/shared";
import { createStreamDownloads, downloadHeaders, type DownloadSink } from "./download-stream";

const meta = (over: Partial<FileMeta> = {}): FileMeta => ({
  type: "file-meta",
  transferId: "t1",
  name: "report.pdf",
  size: 10,
  mimeType: "application/pdf",
  totalChunks: 1,
  ...over,
});

class FakeSink implements DownloadSink {
  chunks: number[] = [];
  closed = false;
  aborted = false;
  onCancel: (() => void) | null = null;
  write(chunk: ArrayBuffer) {
    this.chunks.push(chunk.byteLength);
  }
  close() {
    this.closed = true;
  }
  abort() {
    this.aborted = true;
  }
}

function setup(windowMs = 1_000) {
  const sinks: FakeSink[] = [];
  const open = vi.fn(async () => {
    const sink = new FakeSink();
    sinks.push(sink);
    return sink;
  });
  return { sinks, open, create: createStreamDownloads(open, windowMs) };
}

describe("streamed downloads", () => {
  afterEach(() => vi.useRealTimers());

  it("streams chunks into one browser download and closes it on finish", async () => {
    const { sinks, create } = setup();
    const store = await create(meta());
    expect(store.offset).toBe(0);
    await store.write(new ArrayBuffer(4));
    await store.write(new ArrayBuffer(6));
    await expect(store.finish()).resolves.toBeNull(); // already delivered to the user
    expect(sinks[0]).toMatchObject({ chunks: [4, 6], closed: true });
  });

  it("holds a suspended download open and resumes into it at the written offset", async () => {
    const { sinks, open, create } = setup();
    const first = await create(meta());
    await first.write(new ArrayBuffer(4));
    await first.suspend();

    const resumed = await create(meta());
    expect(resumed.offset).toBe(4);
    expect(open).toHaveBeenCalledOnce();
    await resumed.write(new ArrayBuffer(6));
    await resumed.finish();
    expect(sinks).toHaveLength(1);
    expect(sinks[0]).toMatchObject({ chunks: [4, 6], closed: true, aborted: false });
  });

  it("starts a new download when the resent file does not match", async () => {
    const { sinks, create } = setup();
    const first = await create(meta());
    await first.write(new ArrayBuffer(4));
    await first.suspend();
    const other = await create(meta({ size: 99 }));
    expect(other.offset).toBe(0);
    expect(sinks[0]?.aborted).toBe(true);
    expect(sinks).toHaveLength(2);
  });

  it("fails the browser download if the sender never comes back", async () => {
    vi.useFakeTimers();
    const { sinks, create } = setup(1_000);
    const store = await create(meta());
    await store.suspend();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sinks[0]?.aborted).toBe(true);
    const fresh = await create(meta());
    expect(fresh.offset).toBe(0);
  });

  it("rejects further writes once the user cancels the download", async () => {
    const { sinks, create } = setup();
    const store = await create(meta());
    sinks[0]!.onCancel?.();
    await expect(store.write(new ArrayBuffer(1))).rejects.toThrow("cancelled");
  });

  it("aborts the browser download when the transfer is aborted", async () => {
    const { sinks, create } = setup();
    const store = await create(meta());
    await store.abort();
    expect(sinks[0]?.aborted).toBe(true);
  });
});

describe("downloadHeaders", () => {
  it("forces a sandboxed attachment whatever the sender claims", () => {
    const headers = downloadHeaders(meta({ name: "x.html", mimeType: "text/html", size: 42 }));
    expect(headers).toMatchObject({
      "Content-Type": "application/octet-stream",
      "Content-Length": "42",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("encodes non-ASCII and quote characters safely in the filename", () => {
    const disposition = downloadHeaders(meta({ name: 'ripoti "Q1" (ya mwisho)ñ.pdf' }))[
      "Content-Disposition"
    ];
    expect(disposition).toBe(
      `attachment; filename="ripoti _Q1_ (ya mwisho)_.pdf"; filename*=UTF-8''ripoti%20%22Q1%22%20%28ya%20mwisho%29%C3%B1.pdf`,
    );
  });
});
