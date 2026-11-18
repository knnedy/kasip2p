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

function DeviceEnd({ end, side }: { end: End; side: "you" | "them" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-[40%] items-center gap-2 rounded-full border bg-card py-1.5 pr-3 pl-1.5",
        side === "you" ? "border-you/30" : "flex-row-reverse border-them/30 pr-1.5 pl-3",
      )}>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          side === "you" ? "bg-you/15 text-you" : "bg-them/15 text-them",
        )}>
        <OsIcon os={end.os ?? "unknown"} size={14} />
      </span>
      <span className="min-w-0 truncate font-display text-sm font-semibold font-stretch-expanded text-foreground">
        {end.name}
      </span>
    </div>
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
    <div className={cn("flex items-center gap-2", className)} role="img" aria-label={label}>
      <DeviceEnd end={you} side="you" />
      <svg
        viewBox={`0 0 ${WIRE_W} ${WIRE_H}`}
        className="min-w-12 flex-1 overflow-visible"
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
          stroke={route === "unknown" ? "var(--line)" : `url(#${gradientId})`}
          strokeOpacity={route === "unknown" ? 1 : 0.3}
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
        {route === "relay" && (
          <g>
            <rect x={WIRE_W / 2 - 5} y={11} width={10} height={10} rx={2} fill="var(--card)" stroke="var(--muted-foreground)" />
            <text x={WIRE_W / 2} y={WIRE_H + 2} textAnchor="middle" fontSize={8} fill="var(--muted-foreground)">
              relay
            </text>
          </g>
        )}
      </svg>
      <DeviceEnd end={them} side="them" />
    </div>
  );
}
