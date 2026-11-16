import type { TransferProgress } from "@kasip2p/shared";

export interface TransferInfo {
  transferId: string;
  peerId: string;
  fileName: string;
  totalBytes: number;
  direction: TransferProgress["direction"];
}

export type Transfer =
  | {
      status: "active";
      info: TransferInfo;
      transferredBytes: number;
      baseBytes: number; // already held when this attempt started (resume)
      startedAt: number;
      updatedAt: number;
    }
  | { status: "completed"; info: TransferInfo; startedAt: number; completedAt: number }
  | {
      status: "failed";
      info: TransferInfo;
      transferredBytes: number;
      startedAt: number;
      reason: string;
    };

export type TransfersState = Readonly<Record<string, Transfer>>;

export type TransferEvent =
  | { type: "started"; info: TransferInfo; at: number; offset?: number }
  | { type: "progressed"; transferId: string; transferredBytes: number; at: number }
  | { type: "completed"; transferId: string; at: number }
  | { type: "failed"; transferId: string; reason: string };

// Only active transfers move; events for unknown or finished transfers are ignored.
export function transfersReducer(
  state: TransfersState,
  event: TransferEvent,
): TransfersState {
  if (event.type === "started") {
    const existing = state[event.info.transferId];
    if (existing?.status === "active") return state;
    const transfer: Transfer = {
      status: "active",
      info: event.info,
      transferredBytes: event.offset ?? 0,
      baseBytes: event.offset ?? 0,
      startedAt: event.at,
      updatedAt: event.at,
    };
    return { ...state, [event.info.transferId]: transfer };
  }

  const current = state[event.transferId];
  if (current?.status !== "active") return state;

  let next: Transfer;
  switch (event.type) {
    case "progressed": {
      const bytes = Math.min(event.transferredBytes, current.info.totalBytes);
      if (bytes < current.transferredBytes) return state;
      next = { ...current, transferredBytes: bytes, updatedAt: event.at };
      break;
    }
    case "completed":
      next = {
        status: "completed",
        info: current.info,
        startedAt: current.startedAt,
        completedAt: event.at,
      };
      break;
    case "failed":
      next = {
        status: "failed",
        info: current.info,
        transferredBytes: current.transferredBytes,
        startedAt: current.startedAt,
        reason: event.reason,
      };
      break;
  }
  return { ...state, [event.transferId]: next };
}

export function toProgress(
  t: Extract<Transfer, { status: "active" }>,
): TransferProgress {
  const seconds = (t.updatedAt - t.startedAt) / 1000;
  return {
    transferId: t.info.transferId,
    fileName: t.info.fileName,
    totalBytes: t.info.totalBytes,
    transferredBytes: t.transferredBytes,
    speedMBps:
      seconds > 0 ? (t.transferredBytes - t.baseBytes) / seconds / 1024 / 1024 : 0,
    direction: t.info.direction,
  };
}

export function activeTransfers(
  state: TransfersState,
  peerId?: string,
): TransferProgress[] {
  return Object.values(state)
    .filter((t) => t.status === "active")
    .filter((t) => peerId === undefined || t.info.peerId === peerId)
    .map(toProgress);
}
