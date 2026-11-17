import { describe, expect, it } from "vitest";
import { crc32, createZipWriter } from "./zip";

const enc = new TextEncoder();

function build(files: [string, string[]][], zip64Threshold?: number) {
  const parts: Uint8Array[] = [];
  const zip = createZipWriter((b) => parts.push(new Uint8Array(b)), {
    now: new Date(2024, 0, 2, 3, 4, 6),
    zip64Threshold,
  });
  for (const [path, chunks] of files) {
    const size = chunks.reduce((n, c) => n + enc.encode(c).length, 0);
    zip.begin(path, size);
    for (const c of chunks) zip.data(enc.encode(c).buffer);
    zip.end();
  }
  zip.close();
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Reads entries back through the central directory, as unzip tools do.
function readZip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer);
  const eocd = bytes.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  let count = v.getUint16(eocd + 10, true);
  let cdOffset = v.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    expect(v.getUint32(loc, true)).toBe(0x07064b50);
    const e64 = Number(v.getBigUint64(loc + 8, true));
    expect(v.getUint32(e64, true)).toBe(0x06064b50);
    count = Number(v.getBigUint64(e64 + 32, true));
    cdOffset = Number(v.getBigUint64(e64 + 48, true));
  }
  const entries: { path: string; text: string; crcOk: boolean }[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    let size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    let local = v.getUint32(p + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    let x = p + 46 + nameLen;
    if (extraLen) {
      expect(v.getUint16(x, true)).toBe(0x0001);
      x += 4;
      if (size === 0xffffffff) {
        size = Number(v.getBigUint64(x, true));
        x += 16;
      }
      if (local === 0xffffffff) local = Number(v.getBigUint64(x, true));
    }
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    entries.push({ path, text: new TextDecoder().decode(data), crcOk: crc32(data) === crc });
    p += 46 + nameLen + extraLen;
  }
  return entries;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("can be computed incrementally", () => {
    const whole = crc32(enc.encode("hello world"));
    expect(crc32(enc.encode(" world"), crc32(enc.encode("hello")))).toBe(whole);
  });
});

describe("createZipWriter", () => {
  it("writes stored entries with paths, data split across chunks, and CRCs", () => {
    const zip = build([
      ["photos/a.txt", ["hel", "lo"]],
      ["photos/2024/ü.txt", ["héllo wörld"]],
      ["photos/empty", []],
    ]);
    expect(readZip(zip)).toEqual([
      { path: "photos/a.txt", text: "hello", crcOk: true },
      { path: "photos/2024/ü.txt", text: "héllo wörld", crcOk: true },
      { path: "photos/empty", text: "", crcOk: true },
    ]);
  });

  it("switches to ZIP64 records past the size threshold", () => {
    const zip = build(
      [
        ["d/a", ["aaaa"]],
        ["d/b", ["bbbbbbbb"]],
      ],
      4,
    );
    expect(readZip(zip)).toEqual([
      { path: "d/a", text: "aaaa", crcOk: true },
      { path: "d/b", text: "bbbbbbbb", crcOk: true },
    ]);
  });

  it("refuses data beyond the declared size", () => {
    const zip = createZipWriter(() => {});
    zip.begin("a", 1);
    expect(() => zip.data(enc.encode("ab").buffer)).toThrow(/size/);
  });
});
