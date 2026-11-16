"use client";

import { useSignalingStatus } from "@/hooks/use-signaling-status";

const MESSAGES = {
  waking: "Waking server… this can take up to a minute",
  reconnecting: "Connection lost, reconnecting…",
} as const;

// "connecting" is usually instant, so only slow or broken states are shown.
export function ConnectionStatus() {
  const status = useSignalingStatus();
  const message = status === "waking" || status === "reconnecting" ? MESSAGES[status] : null;

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      {message && (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground shadow-lg">
          <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
          {message}
        </div>
      )}
    </div>
  );
}
