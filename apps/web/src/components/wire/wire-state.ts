import type { TransferProgress } from "@kasip2p/shared";
import type { Route } from "@/lib/webrtc/connection-info";

export type Flow = "idle" | "send" | "receive" | "both";

export interface WireSummary {
  flow: Flow;
  progress: number | null; // 0..1 across all active transfers
  speedMBps: number; // only transfers that are moving
  paused: boolean; // something is active and all of it is paused
}

export function summarizeWire(active: TransferProgress[]): WireSummary {
  if (active.length === 0) return { flow: "idle", progress: null, speedMBps: 0, paused: false };
  const sending = active.some((x) => x.direction === "sending");
  const receiving = active.some((x) => x.direction === "receiving");
  const total = active.reduce((n, x) => n + x.totalBytes, 0);
  const done = active.reduce((n, x) => n + x.transferredBytes, 0);
  const moving = active.filter((x) => !x.pausedBy);
  return {
    flow: sending && receiving ? "both" : sending ? "send" : "receive",
    progress: total > 0 ? done / total : 0,
    speedMBps: moving.reduce((n, x) => n + x.speedMBps, 0),
    paused: moving.length === 0,
  };
}

// Seconds for a burst to cross the wire: brisk at speed, never frantic.
export function burstSeconds(speedMBps: number): number {
  const s = 2.4 - Math.log2(1 + Math.max(0, speedMBps)) * 0.45;
  return Math.round(Math.min(2.4, Math.max(0.5, s)) * 100) / 100;
}

export const WIRE_W = 240;
export const WIRE_H = 32;

// Drawn from the sending end, so dashes and fill travel the right way.
export function wirePath(route: Route, reverse: boolean): string {
  const [a, b] = reverse ? [WIRE_W, 0] : [0, WIRE_W];
  if (route === "internet") return `M ${a} 26 Q ${WIRE_W / 2} -6 ${b} 26`;
  return `M ${a} 16 L ${b} 16`;
}
