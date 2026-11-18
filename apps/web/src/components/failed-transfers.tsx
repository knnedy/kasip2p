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
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const { title, hint } = describeFailure(item.reason, item.direction, peerName);
        return (
        <li
          key={item.transferId}
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-card px-4 py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{item.fileName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {title}
              {hint && ` · ${hint}`}
            </p>
          </div>
          {item.canRetry && (
            <button
              type="button"
              onClick={() => onRetry(item.transferId)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(item.transferId)}
            aria-label={`Dismiss ${item.fileName}`}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
        );
      })}
    </ul>
  );
}
