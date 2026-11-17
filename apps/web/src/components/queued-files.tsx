"use client";

import { useSyncExternalStore } from "react";
import { ArrowUp, Folder, ListOrdered, X } from "lucide-react";
import type { createSendQueue } from "@/lib/transfer/send-queue";

type SendQueue = ReturnType<typeof createSendQueue>;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Up next · {waiting.length} file{waiting.length > 1 ? "s" : ""} · {formatBytes(totalBytes)}
        </p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {rows.map((row) =>
          row.kind === "folder" ? (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{row.name}/</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.files} file{row.files > 1 ? "s" : ""} · {formatBytes(row.bytes)}
              </span>
              <button
                type="button"
                onClick={() => queue.removeFolder(row.id)}
                aria-label={`Remove folder ${row.name} from the queue`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ) : (
            <li
              key={row.item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{row.item.file.name}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(row.item.file.size)}
              </span>
              <button
                type="button"
                onClick={() => queue.move(row.item.id, -1)}
                disabled={row.item.id === firstLoose}
                aria-label={`Move ${row.item.file.name} up`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => queue.remove(row.item.id)}
                aria-label={`Remove ${row.item.file.name} from the queue`}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
