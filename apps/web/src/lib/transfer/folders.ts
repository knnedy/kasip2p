import type { FolderPart } from "@kasip2p/shared";
import { generateId } from "@/lib/utils";

export interface Outgoing {
  file: File;
  folder?: FolderPart;
}

// Minimal shape of FileSystemEntry (drag and drop), so the walk is testable.
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(ok: (f: File) => void, fail?: (e: unknown) => void): void;
  createReader?(): { readEntries(ok: (e: EntryLike[]) => void, fail?: (e: unknown) => void): void };
}

export interface PickedFile {
  file: File;
  path: string; // relative to the drop or pick root, e.g. "photos/2024/a.jpg"
}

// Depth-first; readEntries returns pages (100 in Chrome) until an empty one.
export async function collectEntries(entries: EntryLike[], prefix = ""): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  for (const entry of entries) {
    const path = prefix + entry.name;
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
      out.push({ file, path });
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      const children: EntryLike[] = [];
      for (;;) {
        const page = await new Promise<EntryLike[]>((ok, fail) => reader.readEntries(ok, fail));
        if (page.length === 0) break;
        children.push(...page);
      }
      out.push(...(await collectEntries(children, `${path}/`)));
    }
  }
  return out;
}

// From <input webkitdirectory>, whose files carry webkitRelativePath.
export function pickedFromInput(files: FileList | File[]): PickedFile[] {
  return Array.from(files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

// Loose files first, then each top-level folder's files in path order.
export function planOutgoing(picked: PickedFile[], newId: () => string = generateId): Outgoing[] {
  const loose: Outgoing[] = [];
  const folders = new Map<string, PickedFile[]>();
  for (const p of picked) {
    const slash = p.path.indexOf("/");
    if (slash < 0) {
      loose.push({ file: p.file });
      continue;
    }
    const top = p.path.slice(0, slash);
    folders.set(top, [...(folders.get(top) ?? []), p]);
  }
  const grouped = [...folders].flatMap(([name, files]) => {
    const id = newId();
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return sorted.map((p, index) => ({
      file: p.file,
      folder: { id, name, path: p.path, index, count: sorted.length },
    }));
  });
  return [...loose, ...grouped];
}
