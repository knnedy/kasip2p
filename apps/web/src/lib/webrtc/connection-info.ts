export type Route = "local" | "internet" | "relay" | "unknown";

export interface ConnectionInfo {
  route: Route;
  rttMs: number | null;
}

type StatsLike = { forEach(cb: (stat: Record<string, unknown>) => void): void; get(id: string): unknown };

// Reads the selected ICE pair from getStats(): how the bytes actually travel.
export function describeConnection(stats: StatsLike): ConnectionInfo {
  let pairId: unknown;
  stats.forEach((s) => {
    if (s.type === "transport" && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
  });
  const pair = (typeof pairId === "string" ? stats.get(pairId) : undefined) as
    | Record<string, unknown>
    | undefined;
  if (!pair) return { route: "unknown", rttMs: null };

  const typeOf = (id: unknown) =>
    (typeof id === "string" ? (stats.get(id) as Record<string, unknown> | undefined) : undefined)
      ?.candidateType;
  const types = [typeOf(pair.localCandidateId), typeOf(pair.remoteCandidateId)];
  const route: Route = types.includes("relay")
    ? "relay"
    : types.every((t) => t === "host")
      ? "local"
      : "internet";
  const rtt = pair.currentRoundTripTime;
  return { route, rttMs: typeof rtt === "number" ? Math.round(rtt * 1000) : null };
}
