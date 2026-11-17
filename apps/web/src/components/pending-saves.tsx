"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { pendingSaves, type PendingSave } from "@/lib/transfer/file-store";

const NONE: readonly PendingSave[] = [];

// Shown when the browser holds back an automatic download; a click is always allowed.
export function PendingSaves() {
  const items = useSyncExternalStore(pendingSaves.subscribe, pendingSaves.snapshot, () => NONE);
  if (items.length === 0) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((item) => (
        <div
          key={item.transferId}
          className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              Your browser held this download back. Allow automatic downloads for this site to
              skip this step.
            </p>
          </div>
          <button
            type="button"
            onClick={() => item.save()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            <Download className="h-3.5 w-3.5" />
            Save file
          </button>
        </div>
      ))}
    </div>
  );
}
