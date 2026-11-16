import type { PeerMeta } from "./domain.ts";

/**
 * @deprecated Pre-validation wire format. Use ClientMessage / ServerMessage.
 * Removed once signaling and web have migrated (Stage 1 steps 10-11).
 */
export type SignalMessage =
  | { type: "register"; peerId: string; meta: PeerMeta }
  | { type: "peer-list"; peers: PeerMeta[] }
  | { type: "pair-request"; fromId: string; targetId: string }
  | { type: "pair-pin"; fromId: string; targetId: string; pin: string }
  | { type: "pair-confirm"; fromId: string; targetId: string; pin: string }
  | { type: "pair-accept"; fromId: string; targetId: string }
  | { type: "pair-reject"; fromId: string; targetId: string }
  | {
      type: "sdp";
      fromId: string;
      targetId: string;
      sdp: { type: RTCSdpType; sdp: string };
    }
  | {
      type: "ice";
      fromId: string;
      targetId: string;
      candidate: RTCIceCandidateInit;
    }
  | { type: "error"; message: string };
