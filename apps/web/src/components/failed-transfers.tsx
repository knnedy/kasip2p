"use client";

import { AlertCircle, RotateCw, X } from "lucide-react";
import { describeFailure } from "@/lib/format/format";

interface FailedItem {
  transferId: string;
  fileName: string;
  direction: "sending" | "receiving";
  reason: string;
  canRetry: boolean;
}

// Failed files stay listed until retried or dismissed.
export function FailedTransfers({
  items,
  peerName,
  onRetry,
  onDismiss,
}: {
  items: FailedItem[];
  peerName: string;
  onRetry(transferId: string): void;
  onDismiss(transferId: string): void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const { title, hint } = describeFailure(item.reason, item.direction, peerName);
        return (
          <li
            key={item.transferId}
            className="enter flex items-center gap-3 rounded-2xl border border-destructive/30 bg-card py-2 pr-2 pl-4">
            <AlertCircle className="size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate font-medium text-foreground">{item.fileName}</p>
              <p className="text-sm text-muted-foreground">
                {title}
                {hint && `. ${hint}`}
              </p>
            </div>
            {item.canRetry && (
              <button
                type="button"
                onClick={() => onRetry(item.transferId)}
                className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
                <RotateCw className="size-4" />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(item.transferId)}
              aria-label={`Dismiss ${item.fileName}`}
              className="press flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
