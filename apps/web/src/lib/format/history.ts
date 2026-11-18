const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayLabel(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Date(t).toLocaleDateString([], {
    weekday: days < 7 ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

// Items must already be newest first; groups keep that order.
export function groupByDay<T>(items: T[], timeOf: (item: T) => number, now = Date.now()) {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(timeOf(item), now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export type FileKind = "image" | "video" | "audio" | "archive" | "text" | "sheet" | "other";

const BY_EXTENSION: Record<string, FileKind> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", heic: "image", svg: "image",
  mp4: "video", mov: "video", mkv: "video", webm: "video", avi: "video", "3gp": "video",
  mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", flac: "audio", opus: "audio",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", apk: "archive",
  txt: "text", md: "text", pdf: "text", doc: "text", docx: "text", rtf: "text",
  csv: "sheet", xls: "sheet", xlsx: "sheet", ods: "sheet",
};

export function fileKind(mimeType: string, name: string): FileKind {
  const [major] = mimeType.split("/");
  if (major === "image" || major === "video" || major === "audio") return major;
  if (/zip|compressed|tar|rar|7z/.test(mimeType)) return "archive";
  if (/pdf|msword|wordprocessing|^text\//.test(mimeType)) return "text";
  if (/spreadsheet|excel|csv/.test(mimeType)) return "sheet";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? "other";
}
