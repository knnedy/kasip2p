import { describe, expect, it } from "vitest";
import {
  activeTransfers,
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

  it("filters active transfers by peer", () => {
    const state = run(started, {
      type: "started",
      info: { ...info, transferId: "t2", peerId: "carol" },
      at: 1_000,
    });
    expect(activeTransfers(state, "carol").map((t) => t.transferId)).toEqual(["t2"]);
  });
});
