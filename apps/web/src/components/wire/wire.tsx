"use client";

import { useId } from "react";
import type { OS } from "@kasip2p/shared";
import type { Route } from "@/lib/webrtc/connection-info";
import { OsIcon } from "@/components/os-icon";
import { cn } from "@/lib/utils";
import { burstSeconds, wirePath, WIRE_H, WIRE_W, type WireSummary } from "./wire-state";

interface End {
  name: string;
  os?: OS;
}

const ROUTE_WORDS: Record<Route, string> = {
  local: "direct on your network",
  internet: "direct over the internet",
  relay: "through a relay server",
  unknown: "connecting",
};

function EndNode({ end, side }: { end: End; side: "you" | "them" }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border-2 bg-card",
        side === "you" ? "border-you text-you" : "border-them text-them",
      )}>
      <OsIcon os={end.os ?? "unknown"} size={18} />
    </span>
  );
}

// The connection drawn as a wire: cyan end is this device, amber the other.
// Bursts travel from the sender; the route is drawn as it really is.
export function Wire({
  you,
  them,
  route,
  summary,
  className,
}: {
  you: End;
  them: End;
  route: Route;
  summary: WireSummary;
  className?: string;
}) {
  const gradientId = useId();
  const { flow, progress, paused, speedMBps } = summary;
  const receiving = flow === "receive";
  const path = wirePath(route, receiving);
  const live = flow !== "idle" && !paused && route !== "unknown";
  const pct = progress === null ? null : Math.round(progress * 100);
  const label = [
    `${you.name} to ${them.name}`,
    ROUTE_WORDS[route],
    flow === "idle" ? null : paused ? "paused" : flow === "receive" ? "receiving" : "sending",
    pct === null ? null : `${pct}%`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cn("flex flex-col gap-2", className)} role="img" aria-label={label}>
      <div className="flex items-center">
      <EndNode end={you} side="you" />
      <div className="relative min-w-12 flex-1">
      <svg
        viewBox={`0 0 ${WIRE_W} ${WIRE_H}`}
        preserveAspectRatio="none"
        className="block h-8 w-full overflow-visible"
        aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2={WIRE_W} y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--you)" />
            <stop offset="1" stopColor="var(--them)" />
          </linearGradient>
        </defs>
        {/* the idle wire */}
        <path
          d={path}
          fill="none"
          stroke={route === "unknown" ? "var(--muted-foreground)" : `url(#${gradientId})`}
          strokeOpacity={route === "unknown" ? 0.6 : 0.35}
          strokeWidth={1.5}
          strokeDasharray={route === "unknown" || paused ? "3 5" : undefined}
          strokeLinecap="round"
        />
        {/* progress, filled from the sending end */}
        {pct !== null && flow !== "both" && (
          <path
            d={path}
            pathLength={100}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${pct} 100`}
            className="transition-[stroke-dasharray] duration-500 ease-out-strong"
          />
        )}
        {/* bursts: the only ambient motion; hidden under reduced motion */}
        {live && (
          <path
            d={path}
            pathLength={100}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="4 16"
            className="wire-bursts"
            style={{ animationDuration: `${burstSeconds(speedMBps)}s` }}
          />
        )}
      </svg>
      {route === "relay" && (
        <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          relay
        </span>
      )}
      </div>
      <EndNode end={them} side="them" />
      </div>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-display font-semibold font-stretch-semi-expanded text-foreground">
            {you.name}
          </span>
          <span className="text-muted-foreground"> · you</span>
        </span>
        <span className="min-w-0 truncate text-right font-display font-semibold font-stretch-semi-expanded text-foreground">
          {them.name}
        </span>
      </div>
    </div>
  );
}
