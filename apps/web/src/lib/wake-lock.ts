// Keeps the screen on during transfers: phones freeze pages once the screen
// turns off, which stalls a send part-way.
export interface WakeLockHandle {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

export interface WakeLockEnv {
  request?: () => Promise<WakeLockHandle>; // undefined where unsupported
  visible(): boolean;
  onVisibilityChange(listener: () => void): () => void;
}

export function createWakeLock(env: WakeLockEnv) {
  let wanted = false;
  let held: WakeLockHandle | null = null;
  let pending = false;

  function sync() {
    if (wanted && !held && !pending && env.visible() && env.request) {
      pending = true;
      env
        .request()
        .then((lock) => {
          held = lock;
          // the browser drops it when the page is hidden; retaken on return
          lock.addEventListener("release", () => {
            if (held === lock) held = null;
          });
          if (!wanted) void release();
        })
        .catch(() => {}) // refused (battery saver, policy): transfer goes on regardless
        .finally(() => {
          pending = false;
        });
    } else if (!wanted && held) {
      void release();
    }
  }

  async function release() {
    const lock = held;
    held = null;
    await lock?.release().catch(() => {});
  }

  const stop = env.onVisibilityChange(sync);
  return {
    set(next: boolean) {
      wanted = next;
      sync();
    },
    dispose() {
      wanted = false;
      stop();
      void release();
    },
  };
}
