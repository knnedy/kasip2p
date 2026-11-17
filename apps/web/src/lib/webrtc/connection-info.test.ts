import { describe, expect, it } from "vitest";
import { describeConnection } from "./connection-info";

type Stat = Record<string, unknown> & { id: string; type: string };
const report = (...stats: Stat[]) => new Map(stats.map((s) => [s.id, s]));

const transport: Stat = { id: "T", type: "transport", selectedCandidatePairId: "P" };
const pair = (rtt = 0.004): Stat => ({
  id: "P",
  type: "candidate-pair",
  localCandidateId: "L",
  remoteCandidateId: "R",
  currentRoundTripTime: rtt,
});
const cand = (id: string, candidateType: string): Stat => ({
  id,
  type: id === "L" ? "local-candidate" : "remote-candidate",
  candidateType,
});

describe("describeConnection", () => {
  it("is direct on the local network when both ends use host candidates", () => {
    expect(describeConnection(report(transport, pair(), cand("L", "host"), cand("R", "host")))).toEqual({
      route: "local",
      rttMs: 4,
    });
  });

  it("is direct over the internet when NAT-mapped candidates were used", () => {
    expect(
      describeConnection(report(transport, pair(0.03), cand("L", "srflx"), cand("R", "prflx"))).route,
    ).toBe("internet");
  });

  it("is relayed when either end goes through TURN", () => {
    expect(
      describeConnection(report(transport, pair(), cand("L", "relay"), cand("R", "host"))).route,
    ).toBe("relay");
  });

  it("is unknown before a pair is selected", () => {
    expect(describeConnection(report({ id: "T", type: "transport" }))).toEqual({
      route: "unknown",
      rttMs: null,
    });
  });
});
