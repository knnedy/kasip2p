import { describe, expect, it, vi } from "vitest";
import { createWakeLock, type WakeLockEnv } from "./wake-lock";

function fakeEnv(visible = true) {
  const state = {
    visible,
    held: 0,
    requests: 0,
    onVisible: () => {},
    last: null as null | { release(): Promise<void> },
  };
  const env: WakeLockEnv = {
    visible: () => state.visible,
    onVisibilityChange(cb) {
      state.onVisible = cb;
      return () => {};
    },
    async request() {
      state.requests += 1;
      state.held += 1;
      const listeners: (() => void)[] = [];
      let released = false;
      const sentinel = {
        release: vi.fn(async () => {
          if (released) return;
          released = true;
          state.held -= 1;
          listeners.forEach((l) => l());
        }),
        addEventListener: (_: "release", l: () => void) => void listeners.push(l),
      };
      state.last = sentinel;
      return sentinel;
    },
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { env, state, tick };
}

describe("wake lock", () => {
  it("holds the screen on only while a transfer wants it", async () => {
    const { env, state, tick } = fakeEnv();
    const lock = createWakeLock(env);
    lock.set(true);
    await tick();
    expect(state.held).toBe(1);
    lock.set(true); // no duplicate request
    await tick();
    expect(state.requests).toBe(1);
    lock.set(false);
    await tick();
    expect(state.held).toBe(0);
  });

  it("waits until the page is visible, and re-takes the lock after the system drops it", async () => {
    const { env, state, tick } = fakeEnv(false);
    const lock = createWakeLock(env);
    lock.set(true);
    await tick();
    expect(state.requests).toBe(0);
    state.visible = true;
    state.onVisible();
    await tick();
    expect(state.held).toBe(1);
    // the browser releases screen locks when the page is hidden
    state.visible = false;
    await state.last!.release();
    expect(state.held).toBe(0);
    state.visible = true;
    state.onVisible();
    await tick();
    expect(state.requests).toBe(2);
  });

  it("does nothing where the API is missing or refuses", async () => {
    const missing = createWakeLock({ ...fakeEnv().env, request: undefined });
    expect(() => missing.set(true)).not.toThrow();
    const refused = createWakeLock({ ...fakeEnv().env, request: () => Promise.reject(new Error("no")) });
    refused.set(true);
    await new Promise((r) => setTimeout(r, 0));
  });
});
