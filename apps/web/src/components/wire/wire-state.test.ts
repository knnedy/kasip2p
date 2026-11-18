import { describe, expect, it } from "vitest";
import type { TransferProgress } from "@kasip2p/shared";
import { burstSeconds, summarizeWire, wirePath } from "./wire-state";

const t = (p: Partial<TransferProgress>): TransferProgress => ({
  transferId: "t",
  fileName: "a",
  totalBytes: 100,
  transferredBytes: 0,
  speedMBps: 0,
  direction: "sending",
  pausedBy: null,
  ...p,
});

describe("summarizeWire", () => {
  it("is idle with nothing moving", () => {
    expect(summarizeWire([])).toEqual({ flow: "idle", progress: null, speedMBps: 0, paused: false });
  });

  it("combines progress and speed across active transfers", () => {
    const s = summarizeWire([
      t({ totalBytes: 100, transferredBytes: 50, speedMBps: 2 }),
      t({ totalBytes: 300, transferredBytes: 50, speedMBps: 3 }),
    ]);
    expect(s).toEqual({ flow: "send", progress: 0.25, speedMBps: 5, paused: false });
  });

  it("shows receive, both ways, and paused only when everything is paused", () => {
    expect(summarizeWire([t({ direction: "receiving" })]).flow).toBe("receive");
    expect(summarizeWire([t({}), t({ direction: "receiving" })]).flow).toBe("both");
    expect(summarizeWire([t({ pausedBy: "local" })]).paused).toBe(true);
    const mixed = summarizeWire([t({ pausedBy: "remote", speedMBps: 9 }), t({ speedMBps: 1 })]);
    expect(mixed).toMatchObject({ paused: false, speedMBps: 1 });
  });
});

describe("burstSeconds", () => {
  it("moves faster as speed rises, within bounds", () => {
    expect(burstSeconds(0)).toBe(2.4);
    expect(burstSeconds(1)).toBeLessThan(burstSeconds(0.1));
    expect(burstSeconds(10_000)).toBe(0.5);
  });
});

describe("wirePath", () => {
  it("draws local straight, internet as an arc, and reverses for receiving", () => {
    expect(wirePath("local", false)).toBe("M 0 16 L 240 16");
    expect(wirePath("local", true)).toBe("M 240 16 L 0 16");
    expect(wirePath("internet", false)).toMatch(/^M 0 \d+ Q 120 /);
  });
});
