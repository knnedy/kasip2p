import type { TransferProgress } from "@kasip2p/shared";

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

export async function sendFile(
  dc: RTCDataChannel,
  file: File,
  transferId: string,
  onProgress: (progress: TransferProgress) => void,
) {
  const totalBytes = file.size;
  let transferredBytes = 0;
  const startTime = Date.now();

  // send file metadata first so receiver knows what to expect
  dc.send(
    JSON.stringify({
      type: "file-meta",
      transferId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    }),
  );

  let offset = 0;

  while (offset < file.size) {
    // back-pressure: wait if buffer is filling up
    if (dc.bufferedAmount > 16 * 1024 * 1024) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    dc.send(buffer);

    offset += buffer.byteLength;
    transferredBytes += buffer.byteLength;

    const elapsed = (Date.now() - startTime) / 1000;
    const speedMBps = transferredBytes / elapsed / 1024 / 1024;

    onProgress({
      transferId,
      fileName: file.name,
      totalBytes,
      transferredBytes,
      speedMBps,
      direction: "sending",
    });
  }
}

export function createReceiver(
  onProgress: (progress: TransferProgress) => void,
  onComplete: (file: File, transferId: string) => void,
) {
  let meta: {
    transferId: string;
    name: string;
    size: number;
    mimeType: string;
    totalChunks: number;
  } | null = null;

  const chunks: ArrayBuffer[] = [];
  const startTime = { value: Date.now() };

  return function handleChunk(data: ArrayBuffer | string) {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      if (msg.type === "file-meta") {
        meta = msg;
        startTime.value = Date.now();
        chunks.length = 0;
      }
      return;
    }

    if (!meta) return;

    chunks.push(data);

    const transferredBytes = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const elapsed = (Date.now() - startTime.value) / 1000;
    const speedMBps = transferredBytes / elapsed / 1024 / 1024;

    onProgress({
      transferId: meta.transferId,
      fileName: meta.name,
      totalBytes: meta.size,
      transferredBytes,
      speedMBps,
      direction: "receiving",
    });

    if (chunks.length === meta.totalChunks) {
      const blob = new Blob(chunks, { type: meta.mimeType });
      const file = new File([blob], meta.name, { type: meta.mimeType });
      onComplete(file, meta.transferId);
      meta = null;
      chunks.length = 0;
    }
  };
}
