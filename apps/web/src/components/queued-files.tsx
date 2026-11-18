"use client";

import { useSyncExternalStore } from "react";
import { ArrowUp, Folder, X } from "lucide-react";
import { SectionTitle } from "@/components/section-title";
import type { createSendQueue } from "@/lib/transfer/send-queue";
import { formatBytes } from "@/lib/format/format";

type SendQueue = ReturnType<typeof createSendQueue>;

// Files waiting behind the one in flight; reorder or remove before they start.
export function QueuedFiles({ queue, peerId }: { queue: SendQueue; peerId: string }) {
  const items = useSyncExternalStore(
    queue.subscribe,
    () => queue.snapshot(peerId),
    () => queue.snapshot(peerId),
  );
  const waiting = items.filter((i) => i.status === "queued");
  if (waiting.length === 0) return null;
  const totalBytes = waiting.reduce((sum, i) => sum + i.file.size, 0);
  // a folder's waiting files show as one row; it is removed as a whole
  type Row =
    | { kind: "file"; item: (typeof waiting)[number] }
    | { kind: "folder"; id: string; name: string; files: number; bytes: number };
  const rows: Row[] = [];
  for (const item of waiting) {
    const folder = item.folder;
    if (!folder) {
      rows.push({ kind: "file", item });
      continue;
    }
    const last = rows.at(-1);
    if (last?.kind === "folder" && last.id === folder.id) {
      last.files += 1;
      last.bytes += item.file.size;
    } else {
      rows.push({ kind: "folder", id: folder.id, name: folder.name, files: 1, bytes: item.file.size });
    }
  }
  const firstLoose = waiting.find((i) => !i.folder)?.id;

  const iconButton =
    "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  const row = "flex min-h-14 items-center gap-3 border-b border-border py-1 last:border-b-0";

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        Up next · {waiting.length} file{waiting.length > 1 ? "s" : ""} · {formatBytes(totalBytes)}
      </SectionTitle>
      <ol className="flex flex-col">
        {rows.map((row_) =>
          row_.kind === "folder" ? (
            <li key={row_.id} className={row}>
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-foreground">{row_.name}/</p>
              <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                {row_.files} file{row_.files > 1 ? "s" : ""} · {formatBytes(row_.bytes)}
              </span>
              <button
                type="button"
                onClick={() => queue.removeFolder(row_.id)}
                aria-label={`Remove folder ${row_.name} from the queue`}
                className={iconButton}>
                <X className="size-4" />
              </button>
            </li>
          ) : (
            <li key={row_.item.id} className={row}>
              <p className="min-w-0 flex-1 truncate text-foreground">{row_.item.file.name}</p>
              <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                {formatBytes(row_.item.file.size)}
              </span>
              <button
                type="button"
                onClick={() => queue.move(row_.item.id, -1)}
                disabled={row_.item.id === firstLoose}
                aria-label={`Move ${row_.item.file.name} up`}
                className={iconButton}>
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => queue.remove(row_.item.id)}
                aria-label={`Remove ${row_.item.file.name} from the queue`}
                className={iconButton}>
                <X className="size-4" />
              </button>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
