// Requester asks to pair and types the PIN; approver accepted the request and shows it.
export type PairingRole = "requester" | "approver";

export type PairingState =
  | { status: "awaiting-pin"; role: "requester"; pinError: boolean }
  | { status: "verifying"; role: "requester" }
  | { status: "showing-pin"; role: "approver" }
  | { status: "paired"; role: PairingRole }
  | { status: "rejected"; role: PairingRole }
  | { status: "unreachable"; role: PairingRole };

export type PairingEvent =
  | { type: "pin-edited" }
  | { type: "pin-submitted" }
  | { type: "pin-incorrect" }
  | { type: "accepted" }
  | { type: "rejected" }
  | { type: "unreachable" };

export function initialPairingState(role: PairingRole): PairingState {
  return role === "requester"
    ? { status: "awaiting-pin", role, pinError: false }
    : { status: "showing-pin", role };
}

export function isPairingDone(state: PairingState): boolean {
  return ["paired", "rejected", "unreachable"].includes(state.status);
}

// Events that do not apply to the current state are ignored.
export function pairingReducer(
  state: PairingState,
  event: PairingEvent,
): PairingState {
  if (isPairingDone(state)) return state;

  switch (event.type) {
    case "rejected":
      return { status: "rejected", role: state.role };
    case "unreachable":
      return { status: "unreachable", role: state.role };
    case "pin-edited":
      return state.status === "awaiting-pin" && state.pinError
        ? { ...state, pinError: false }
        : state;
    case "pin-submitted":
      return state.status === "awaiting-pin"
        ? { status: "verifying", role: "requester" }
        : state;
    case "pin-incorrect":
      return state.status === "verifying"
        ? { status: "awaiting-pin", role: "requester", pinError: true }
        : state;
    case "accepted":
      return state.status === "verifying" || state.status === "showing-pin"
        ? { status: "paired", role: state.role }
        : state;
  }
}
