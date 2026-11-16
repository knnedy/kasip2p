import { describe, expect, it } from "vitest";
import {
  initialPairingState,
  pairingReducer,
  type PairingEvent,
  type PairingState,
} from "./machine";

function run(state: PairingState, ...events: PairingEvent["type"][]) {
  return events.reduce((s, type) => pairingReducer(s, { type }), state);
}

const requester = initialPairingState("requester");
const approver = initialPairingState("approver");

describe("pairingReducer", () => {
  it("starts requester awaiting a PIN and approver showing one", () => {
    expect(requester).toEqual({ status: "awaiting-pin", role: "requester", pinError: false });
    expect(approver).toEqual({ status: "showing-pin", role: "approver" });
  });

  it("pairs the requester after a correct PIN", () => {
    expect(run(requester, "pin-submitted", "accepted")).toEqual({
      status: "paired",
      role: "requester",
    });
  });

  it("returns to PIN entry with an error, cleared on edit", () => {
    const wrong = run(requester, "pin-submitted", "pin-incorrect");
    expect(wrong).toEqual({ status: "awaiting-pin", role: "requester", pinError: true });
    expect(run(wrong, "pin-edited")).toEqual(requester);
  });

  it("ignores accept before the requester submitted a PIN", () => {
    expect(run(requester, "accepted")).toBe(requester);
  });

  it("ignores a stray incorrect-pin while not verifying", () => {
    expect(run(requester, "pin-incorrect")).toBe(requester);
  });

  it("pairs the approver when the server accepts", () => {
    expect(run(approver, "accepted")).toEqual({ status: "paired", role: "approver" });
  });

  it("ignores requester-only events on the approver", () => {
    expect(run(approver, "pin-submitted", "pin-incorrect", "pin-edited")).toBe(approver);
  });

  it.each(["rejected", "unreachable", "expired", "locked"] as const)("ends on %s from any live state", (type) => {
    expect(run(requester, type).status).toBe(type);
    expect(run(requester, "pin-submitted", type).status).toBe(type);
    expect(run(approver, type).status).toBe(type);
  });

  it("is terminal once done", () => {
    const paired = run(approver, "accepted");
    expect(run(paired, "rejected")).toBe(paired);
  });
});
