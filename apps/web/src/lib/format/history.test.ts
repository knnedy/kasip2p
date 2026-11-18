import { describe, expect, it } from "vitest";
import { dayLabel, fileKind, groupByDay } from "./history";

// local-time dates, so the tests hold in any time zone
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const now = at(2026, 11, 18, 15);

describe("dayLabel", () => {
  it("names today and yesterday, and dates anything older", () => {
    expect(dayLabel(at(2026, 11, 18, 0), now)).toBe("Today");
    expect(dayLabel(at(2026, 11, 17, 23), now)).toBe("Yesterday");
    expect(dayLabel(at(2026, 11, 10), now)).toMatch(/10/);
    expect(dayLabel(at(2026, 11, 10), now)).not.toBe("Yesterday");
  });
});

describe("groupByDay", () => {
  it("keeps newest-first order and splits at day boundaries", () => {
    const items = [at(2026, 11, 18, 14), at(2026, 11, 18, 9), at(2026, 11, 17, 20), at(2026, 11, 10)].map(
      (completedAt, i) => ({ id: String(i), completedAt }),
    );
    const groups = groupByDay(items, (x) => x.completedAt, now);
    expect(groups.map((g) => [g.label, g.items.map((x) => x.id)])).toEqual([
      ["Today", ["0", "1"]],
      ["Yesterday", ["2"]],
      [dayLabel(at(2026, 11, 10), now), ["3"]],
    ]);
  });
});

describe("fileKind", () => {
  it("reads the MIME type first, then the extension", () => {
    expect(fileKind("image/jpeg", "a.bin")).toBe("image");
    expect(fileKind("", "clip.MP4")).toBe("video");
    expect(fileKind("audio/mpeg", "x")).toBe("audio");
    expect(fileKind("application/zip", "photos.zip")).toBe("archive");
    expect(fileKind("", "notes.txt")).toBe("text");
    expect(fileKind("application/pdf", "cv.pdf")).toBe("text");
    expect(fileKind("", "budget.xlsx")).toBe("sheet");
    expect(fileKind("application/octet-stream", "big.bin")).toBe("other");
  });
});
