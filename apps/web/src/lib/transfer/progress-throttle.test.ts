import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressThrottle } from "./progress-throttle";

describe("createProgressThrottle", () => {
  let emitted: [string, number][];
  let throttle: ReturnType<typeof createProgressThrottle>;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    throttle = createProgressThrottle((id, b) => emitted.push([id, b]), 100);
  });

  afterEach(() => {
    throttle.dispose();
    vi.useRealTimers();
  });

  it("emits the first report immediately", () => {
    throttle.report("t1", 10);
    expect(emitted).toEqual([["t1", 10]]);
  });

  it("coalesces a burst into one trailing emit with the latest value", async () => {
    for (let i = 1; i <= 50; i++) throttle.report("t1", i);
    expect(emitted).toEqual([["t1", 1]]);
    await vi.advanceTimersByTimeAsync(100);
    expect(emitted).toEqual([
      ["t1", 1],
      ["t1", 50],
    ]);
  });

  it("caps the rate at one emit per interval", async () => {
    for (let ms = 0; ms < 1_000; ms += 5) {
      throttle.report("t1", ms);
      await vi.advanceTimersByTimeAsync(5);
    }
    expect(emitted.length).toBeLessThanOrEqual(11);
    expect(emitted.length).toBeGreaterThanOrEqual(9);
  });

  it("throttles transfers independently", () => {
    throttle.report("t1", 1);
    throttle.report("t2", 1);
    expect(emitted).toEqual([
      ["t1", 1],
      ["t2", 1],
    ]);
  });

  it("finish flushes the pending value and cancels the timer", async () => {
    throttle.report("t1", 1);
    throttle.report("t1", 99);
    throttle.finish("t1");
    expect(emitted.at(-1)).toEqual(["t1", 99]);
    await vi.advanceTimersByTimeAsync(200);
    expect(emitted).toHaveLength(2);
  });
});
