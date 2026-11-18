export type PauseSide = "local" | "remote";

// Sending proceeds only while neither side has paused; each side lifts only its own pause.
export function createPauseGate() {
  const paused = { local: false, remote: false };
  let waiters: (() => void)[] = [];
  const open = () => !paused.local && !paused.remote;

  return {
    pause(side: PauseSide) {
      paused[side] = true;
    },
    resume(side: PauseSide) {
      paused[side] = false;
      if (!open()) return;
      const ready = waiters;
      waiters = [];
      ready.forEach((w) => w());
    },
    wait(): Promise<void> {
      return open() ? Promise.resolve() : new Promise((r) => waiters.push(r));
    },
  };
}
