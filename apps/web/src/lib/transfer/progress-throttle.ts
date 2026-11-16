export const PROGRESS_INTERVAL_MS = 100;

// Emits at most once per interval per transfer, keeping the latest value for a trailing emit.
export function createProgressThrottle(
  emit: (transferId: string, bytes: number) => void,
  intervalMs = PROGRESS_INTERVAL_MS,
  now: () => number = Date.now,
) {
  const lastEmit = new Map<string, number>();
  const pending = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function fire(transferId: string, bytes: number) {
    lastEmit.set(transferId, now());
    pending.delete(transferId);
    emit(transferId, bytes);
  }

  return {
    report(transferId: string, bytes: number) {
      const prev = lastEmit.get(transferId);
      const elapsed = prev === undefined ? Infinity : now() - prev;
      if (elapsed >= intervalMs) {
        fire(transferId, bytes);
        return;
      }
      pending.set(transferId, bytes);
      if (timers.has(transferId)) return;
      const timer = setTimeout(() => {
        timers.delete(transferId);
        const latest = pending.get(transferId);
        if (latest !== undefined) fire(transferId, latest);
      }, intervalMs - elapsed);
      timers.set(transferId, timer);
    },

    // Call when a transfer ends: emits any pending value and forgets the transfer.
    finish(transferId: string) {
      const timer = timers.get(transferId);
      if (timer) clearTimeout(timer);
      timers.delete(transferId);
      const latest = pending.get(transferId);
      if (latest !== undefined) emit(transferId, latest);
      pending.delete(transferId);
      lastEmit.delete(transferId);
    },

    dispose() {
      timers.forEach(clearTimeout);
      timers.clear();
      pending.clear();
      lastEmit.clear();
    },
  };
}
