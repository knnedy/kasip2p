import { describe, expect, it } from "vitest";
import {
  activeTransfers,
  failedTransfers,
  transfersReducer,
  type TransferEvent,
  type TransferInfo,
  type TransfersState,
} from "./machine";

const info: TransferInfo = {
  transferId: "t1",
  peerId: "bob",
  fileName: "a.bin",
  totalBytes: 2 * 1024 * 1024,
  direction: "sending",
};

function run(...events: TransferEvent[]): TransfersState {
  return events.reduce(transfersReducer, {});
}

const started: TransferEvent = { type: "started", info, at: 1_000 };

describe("transfersReducer", () => {
  it("starts an active transfer at zero bytes and zero speed", () => {
    expect(activeTransfers(run(started))).toEqual([
      {
        transferId: "t1",
        fileName: "a.bin",
        totalBytes: info.totalBytes,
        transferredBytes: 0,
        speedMBps: 0,
        direction: "sending",
        pausedBy: null,
      },
    ]);
  });

  it("computes speed from elapsed time", () => {
    const state = run(started, {
      type: "progressed",
      transferId: "t1",
      transferredBytes: 1024 * 1024,
      at: 2_000,
    });
    expect(activeTransfers(state)[0]?.speedMBps).toBe(1);
  });

  // a fast first second, then a steady 1 MB/s: 10 MB at 2s, 11..16 MB at 3s..8s
  const MiB = 1024 * 1024;
  const slowedDown = () =>
    run(
      { ...started, info: { ...info, totalBytes: 100 * MiB } },
      { type: "progressed", transferId: "t1", transferredBytes: 10 * MiB, at: 2_000 },
      ...[11, 12, 13, 14, 15, 16].map(
        (mb, i): TransferEvent => ({ type: "progressed", transferId: "t1", transferredBytes: mb * MiB, at: 3_000 + i * 1_000 }),
      ),
    );

  it("reports the current speed, not the average since the start", () => {
    expect(activeTransfers(slowedDown(), undefined, 8_000)[0]?.speedMBps).toBe(1);
  });

  it("ignores a clock that lags behind the last update", () => {
    expect(activeTransfers(slowedDown(), undefined, 0)[0]?.speedMBps).toBe(1);
  });

  it("drops to zero once bytes stop arriving", () => {
    expect(activeTransfers(slowedDown(), undefined, 12_000)[0]?.speedMBps).toBe(0);
  });

  it("never reports progress going backwards or past the total", () => {
    const state = run(
      started,
      { type: "progressed", transferId: "t1", transferredBytes: 500, at: 1_100 },
      { type: "progressed", transferId: "t1", transferredBytes: 100, at: 1_200 },
    );
    expect(activeTransfers(state)[0]?.transferredBytes).toBe(500);

    const over = run(started, {
      type: "progressed",
      transferId: "t1",
      transferredBytes: info.totalBytes * 2,
      at: 1_100,
    });
    expect(activeTransfers(over)[0]?.transferredBytes).toBe(info.totalBytes);
  });

  it("completes and leaves the active list", () => {
    const state = run(started, { type: "completed", transferId: "t1", at: 3_000 });
    expect(state["t1"]).toMatchObject({ status: "completed", completedAt: 3_000 });
    expect(activeTransfers(state)).toEqual([]);
  });

  it("fails with a reason and keeps the bytes sent so far", () => {
    const state = run(
      started,
      { type: "progressed", transferId: "t1", transferredBytes: 10, at: 1_100 },
      { type: "failed", transferId: "t1", reason: "channel closed" },
    );
    expect(state["t1"]).toMatchObject({
      status: "failed",
      transferredBytes: 10,
      reason: "channel closed",
    });
  });

  it("ignores events for unknown or finished transfers", () => {
    const done = run(started, { type: "completed", transferId: "t1", at: 2_000 });
    expect(
      transfersReducer(done, { type: "progressed", transferId: "t1", transferredBytes: 1, at: 3_000 }),
    ).toBe(done);
    expect(
      transfersReducer(done, { type: "failed", transferId: "nope", reason: "x" }),
    ).toBe(done);
  });

  it("resumes from an offset without counting it toward speed", () => {
    const state = run(
      { type: "started", info, at: 1_000, offset: 1024 * 1024 },
      { type: "progressed", transferId: "t1", transferredBytes: 2 * 1024 * 1024, at: 2_000 },
    );
    expect(activeTransfers(state)[0]).toMatchObject({
      transferredBytes: 2 * 1024 * 1024,
      speedMBps: 1,
    });
  });

  it("restarts a failed transfer when it is started again", () => {
    const state = run(
      started,
      { type: "failed", transferId: "t1", reason: "closed" },
      { type: "started", info, at: 5_000, offset: 10 },
    );
    expect(state["t1"]).toMatchObject({ status: "active", transferredBytes: 10 });
  });

  it("marks a transfer paused and resumed without losing progress", () => {
    const paused = run(
      started,
      { type: "progressed", transferId: "t1", transferredBytes: 5, at: 1_100 },
      { type: "paused", transferId: "t1", by: "remote" },
    );
    expect(activeTransfers(paused)[0]).toMatchObject({ transferredBytes: 5, pausedBy: "remote" });
    const resumed = transfersReducer(paused, { type: "resumed", transferId: "t1", by: "remote" });
    expect(activeTransfers(resumed)[0]?.pausedBy).toBeNull();
  });

  it("keeps each side's pause until that side resumes", () => {
    const both = run(
      started,
      { type: "paused", transferId: "t1", by: "local" },
      { type: "paused", transferId: "t1", by: "remote" },
    );
    expect(activeTransfers(both)[0]?.pausedBy).toBe("both");
    const theyResumed = transfersReducer(both, { type: "resumed", transferId: "t1", by: "remote" });
    expect(activeTransfers(theyResumed)[0]?.pausedBy).toBe("local");
    const iResumed = transfersReducer(both, { type: "resumed", transferId: "t1", by: "local" });
    expect(activeTransfers(iResumed)[0]?.pausedBy).toBe("remote");
  });

  it("lists failed transfers per peer until dismissed", () => {
    const failed = run(started, { type: "failed", transferId: "t1", reason: "data channel closed" });
    expect(failedTransfers(failed, "bob")).toEqual([
      { transferId: "t1", fileName: info.fileName, direction: "sending", reason: "data channel closed" },
    ]);
    expect(failedTransfers(failed, "other")).toEqual([]);
    const dismissed = transfersReducer(failed, { type: "dismissed", transferId: "t1" });
    expect(failedTransfers(dismissed, "bob")).toEqual([]);
  });

  it("filters active transfers by peer", () => {
    const state = run(started, {
      type: "started",
      info: { ...info, transferId: "t2", peerId: "carol" },
      at: 1_000,
    });
    expect(activeTransfers(state, "carol").map((t) => t.transferId)).toEqual(["t2"]);
  });
});
