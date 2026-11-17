import { describe, expect, it, vi } from "vitest";
import type { FileMeta, FolderPart } from "@kasip2p/shared";
import type { IncomingFileStore, StoreMeta } from "./file-store";
import { createFolderZips } from "./folder-zips";

const enc = new TextEncoder();
const part = (index: number, path = `pics/${index}.txt`): FolderPart => ({
  id: "f1",
  name: "pics",
  path,
  index,
  count: 2,
});
const meta = (transferId: string, size: number, folder?: FolderPart): FileMeta => ({
  type: "file-meta",
  transferId,
  name: transferId,
  size,
  mimeType: "",
  totalChunks: 1,
  ...(folder && { folder }),
});

function fakeBase() {
  const opened: StoreMeta[] = [];
  const containers: { bytes: number; aborted: boolean; finished: boolean }[] = [];
  const base = vi.fn(async (m: StoreMeta): Promise<IncomingFileStore> => {
    opened.push(m);
    const c = { bytes: 0, aborted: false, finished: false };
    containers.push(c);
    return {
      offset: 0,
      write: async (chunk) => {
        c.bytes += chunk.byteLength;
      },
      finish: async () => {
        c.finished = true;
        return new File([], m.name);
      },
      suspend: async () => {},
      abort: async () => {
        c.aborted = true;
      },
    };
  });
  return { base, opened, containers };
}

const write = (s: IncomingFileStore, text: string) => s.write(enc.encode(text).buffer);

describe("createFolderZips", () => {
  it("passes loose files straight to the base store", async () => {
    const { base, opened } = fakeBase();
    await createFolderZips(base)(meta("t", 1));
    expect(opened[0]!.transferId).toBe("t");
  });

  it("writes a folder's files into one zip named after the folder, delivered at the end", async () => {
    const { base, opened, containers } = fakeBase();
    const create = createFolderZips(base);
    const first = await create(meta("a", 2, part(0)));
    await write(first, "hi");
    await expect(first.finish()).resolves.toBeNull();
    const second = await create(meta("b", 3, part(1)));
    await write(second, "yo!");
    const zipped = await second.finish();
    expect(base).toHaveBeenCalledOnce();
    expect(opened[0]).toMatchObject({ transferId: "f1", name: "pics.zip", lengthUnknown: true });
    expect(zipped?.name).toBe("pics.zip");
    expect(containers[0]!.finished).toBe(true);
    expect(containers[0]!.bytes).toBeGreaterThan(5); // data plus zip records
  });

  it("continues the same entry when a file resumes after a dropped channel", async () => {
    const { base } = fakeBase();
    const create = createFolderZips(base);
    const first = await create(meta("a", 4, part(0)));
    await write(first, "ab");
    await first.suspend();
    const resumed = await create(meta("a", 4, part(0)));
    expect(resumed.offset).toBe(2);
    await write(resumed, "cd");
    await expect(resumed.finish()).resolves.toBeNull();
  });

  it("rejects files out of order or for a folder that was cancelled", async () => {
    const { base, containers } = fakeBase();
    const create = createFolderZips(base);
    await expect(create(meta("b", 1, part(1)))).rejects.toThrow(/folder/);
    const first = await create(meta("a", 1, part(0)));
    await first.abort();
    expect(containers[0]!.aborted).toBe(true);
    await expect(create(meta("b", 1, part(1)))).rejects.toThrow(/folder/);
  });

  it("drops a suspended folder after the resume window", async () => {
    vi.useFakeTimers();
    const { base, containers } = fakeBase();
    const create = createFolderZips(base, 1_000);
    const first = await create(meta("a", 2, part(0)));
    await first.suspend();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(containers[0]!.aborted).toBe(true);
    vi.useRealTimers();
  });
});
