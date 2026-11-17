import { describe, expect, it } from "vitest";
import { collectEntries, planOutgoing, type EntryLike } from "./folders";

const fileEntry = (name: string, body = "x"): EntryLike => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (ok) => ok(new File([body], name)),
});

// readEntries hands out at most `page` entries per call, like Chrome's 100.
const dirEntry = (name: string, children: EntryLike[], page = 2): EntryLike => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let at = 0;
    return {
      readEntries(ok) {
        const batch = children.slice(at, at + page);
        at += batch.length;
        ok(batch);
      },
    };
  },
});

describe("collectEntries", () => {
  it("walks nested folders, reading every page, with paths from the drop root", async () => {
    const tree = dirEntry("photos", [
      fileEntry("a.jpg"),
      dirEntry("2024", [fileEntry("b.jpg"), fileEntry("c.jpg"), fileEntry("d.jpg")]),
      fileEntry("e.jpg"),
    ]);
    const got = await collectEntries([tree, fileEntry("loose.txt")]);
    expect(got.map((g) => g.path)).toEqual([
      "photos/a.jpg",
      "photos/2024/b.jpg",
      "photos/2024/c.jpg",
      "photos/2024/d.jpg",
      "photos/e.jpg",
      "loose.txt",
    ]);
  });
});

describe("planOutgoing", () => {
  it("groups files by top folder, sorted by path, with index and count", () => {
    let n = 0;
    const plan = planOutgoing(
      [
        { file: new File(["1"], "b.jpg"), path: "photos/b.jpg" },
        { file: new File(["1"], "loose.txt"), path: "loose.txt" },
        { file: new File(["1"], "a.jpg"), path: "photos/2024/a.jpg" },
      ],
      () => `f${++n}`,
    );
    expect(plan.map((o) => [o.file.name, o.folder])).toEqual([
      ["loose.txt", undefined],
      ["a.jpg", { id: "f1", name: "photos", path: "photos/2024/a.jpg", index: 0, count: 2 }],
      ["b.jpg", { id: "f1", name: "photos", path: "photos/b.jpg", index: 1, count: 2 }],
    ]);
  });
});
