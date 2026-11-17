"use client";

import { useSyncExternalStore } from "react";
import { ArrowUp, ListOrdered, X } from "lucide-react";
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Up next · {waiting.length} file{waiting.length > 1 ? "s" : ""} · {formatBytes(totalBytes)}
        </p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {waiting.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.file.name}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatBytes(item.file.size)}
            </span>
            <button
              type="button"
              onClick={() => queue.move(item.id, -1)}
              disabled={index === 0}
              aria-label={`Move ${item.file.name} up`}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => queue.remove(item.id)}
              aria-label={`Remove ${item.file.name} from the queue`}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
