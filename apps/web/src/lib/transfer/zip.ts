// Streaming ZIP writer: stored entries (no compression), CRC computed on the fly
// and written in a data descriptor. ZIP64 records are used only when needed.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// Pass the previous result as `crc` to continue across chunks.
export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

const MAX32 = 0xffffffff;
const FLAGS = 0x0808; // bit 3: sizes/CRC follow the data; bit 11: UTF-8 names

interface Entry {
  name: Uint8Array;
  size: number;
  offset: number;
  crc: number;
  zip64: boolean;
}

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function record(size: number, fill: (v: DataView) => void, tail?: Uint8Array[]): ArrayBuffer {
  const tailLen = tail?.reduce((n, t) => n + t.length, 0) ?? 0;
  const buf = new ArrayBuffer(size + tailLen);
  fill(new DataView(buf));
  let at = size;
  for (const t of tail ?? []) {
    new Uint8Array(buf, at, t.length).set(t);
    at += t.length;
  }
  return buf;
}

export interface ZipWriterOptions {
  now?: Date;
  zip64Threshold?: number; // tests only: lower than 0xffffffff to exercise ZIP64
}

// emit receives bytes in order; data chunks are passed through without copying.
export function createZipWriter(
  emit: (bytes: ArrayBuffer) => void,
  { now = new Date(), zip64Threshold = MAX32 }: ZipWriterOptions = {},
) {
  const { time, date } = dosDateTime(now);
  const entries: Entry[] = [];
  let offset = 0;
  let current: (Entry & { written: number }) | null = null;
  const big = (n: number) => n >= zip64Threshold;

  const out = (buf: ArrayBuffer) => {
    offset += buf.byteLength;
    emit(buf);
  };

  return {
    begin(path: string, size: number) {
      if (current) throw new Error("previous zip entry not ended");
      const name = new TextEncoder().encode(path);
      const zip64 = big(size) || big(offset);
      current = { name, size, offset, crc: 0, zip64, written: 0 };
      // ZIP64 local extra holds zero sizes; the real ones go in the descriptor
      const extra = zip64 ? zip64Extra(16, 0, null) : new Uint8Array(0);
      out(
        record(
          30,
          (v) => {
            v.setUint32(0, 0x04034b50, true);
            v.setUint16(4, zip64 ? 45 : 20, true);
            v.setUint16(6, FLAGS, true);
            v.setUint16(10, time, true);
            v.setUint16(12, date, true);
            if (zip64) {
              v.setUint32(18, MAX32, true);
              v.setUint32(22, MAX32, true);
            }
            v.setUint16(26, name.length, true);
            v.setUint16(28, extra.length, true);
          },
          [name, extra],
        ),
      );
    },
    data(chunk: ArrayBuffer) {
      if (!current) throw new Error("no zip entry open");
      if (current.written + chunk.byteLength > current.size) {
        throw new Error("data beyond the declared size");
      }
      current.crc = crc32(new Uint8Array(chunk), current.crc);
      current.written += chunk.byteLength;
      out(chunk);
    },
    end() {
      if (!current) throw new Error("no zip entry open");
      if (current.written !== current.size) throw new Error("entry shorter than its declared size");
      const e = current;
      out(
        record(e.zip64 ? 24 : 16, (v) => {
          v.setUint32(0, 0x08074b50, true);
          v.setUint32(4, e.crc, true);
          if (e.zip64) {
            v.setBigUint64(8, BigInt(e.size), true);
            v.setBigUint64(16, BigInt(e.size), true);
          } else {
            v.setUint32(8, e.size, true);
            v.setUint32(12, e.size, true);
          }
        }),
      );
      entries.push(e);
      current = null;
    },
    close() {
      if (current) throw new Error("zip entry not ended");
      const cdStart = offset;
      for (const e of entries) {
        const sizeBig = big(e.size);
        const offBig = big(e.offset);
        const extra = (sizeBig ? 16 : 0) + (offBig ? 8 : 0);
        const extraLen = extra ? 4 + extra : 0;
        out(
          record(
            46,
            (v) => {
              v.setUint32(0, 0x02014b50, true);
              v.setUint16(4, 45, true);
              v.setUint16(6, e.zip64 || offBig ? 45 : 20, true);
              v.setUint16(8, FLAGS, true);
              v.setUint16(12, time, true);
              v.setUint16(14, date, true);
              v.setUint32(16, e.crc, true);
              v.setUint32(20, sizeBig ? MAX32 : e.size, true);
              v.setUint32(24, sizeBig ? MAX32 : e.size, true);
              v.setUint16(28, e.name.length, true);
              v.setUint16(30, extraLen, true);
              v.setUint32(42, offBig ? MAX32 : e.offset, true);
            },
            [e.name, zip64Extra(extra, sizeBig ? e.size : null, offBig ? e.offset : null)],
          ),
        );
      }
      const cdSize = offset - cdStart;
      const needs64 = entries.length >= 0xffff || big(cdStart) || big(cdSize);
      if (needs64) {
        const eocd64At = offset;
        out(
          record(56, (v) => {
            v.setUint32(0, 0x06064b50, true);
            v.setBigUint64(4, BigInt(44), true);
            v.setUint16(12, 45, true);
            v.setUint16(14, 45, true);
            v.setBigUint64(24, BigInt(entries.length), true);
            v.setBigUint64(32, BigInt(entries.length), true);
            v.setBigUint64(40, BigInt(cdSize), true);
            v.setBigUint64(48, BigInt(cdStart), true);
          }),
        );
        out(
          record(20, (v) => {
            v.setUint32(0, 0x07064b50, true);
            v.setBigUint64(8, BigInt(eocd64At), true);
            v.setUint32(16, 1, true);
          }),
        );
      }
      out(
        record(22, (v) => {
          v.setUint32(0, 0x06054b50, true);
          v.setUint16(8, needs64 ? 0xffff : entries.length, true);
          v.setUint16(10, needs64 ? 0xffff : entries.length, true);
          v.setUint32(12, needs64 ? MAX32 : cdSize, true);
          v.setUint32(16, needs64 ? MAX32 : cdStart, true);
        }),
      );
    },
  };
}

function zip64Extra(len: number, size: number | null, offset: number | null): Uint8Array {
  if (!len) return new Uint8Array(0);
  const buf = new ArrayBuffer(4 + len);
  const v = new DataView(buf);
  v.setUint16(0, 0x0001, true);
  v.setUint16(2, len, true);
  let at = 4;
  if (size !== null) {
    v.setBigUint64(at, BigInt(size), true);
    v.setBigUint64(at + 8, BigInt(size), true);
    at += 16;
  }
  if (offset !== null) v.setBigUint64(at, BigInt(offset), true);
  return new Uint8Array(buf);
}
