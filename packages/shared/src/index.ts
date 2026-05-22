export type OS = "android" | "ios" | "macos" | "windows" | "linux" | "unknown";

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type ConnectionState =
  | "discovered"
  | "pairing"
  | "connected"
  | "transferring"
  | "disconnected";

export interface PeerMeta {
  peerId: string;
  name: string;
  os: OS;
  deviceType: DeviceType;
}

export type SignalMessage =
  | { type: "register"; peerId: string; meta: PeerMeta }
  | { type: "peer-list"; peers: PeerMeta[] }
  | { type: "pair-request"; fromId: string; targetId: string }
  | { type: "pair-pin"; fromId: string; targetId: string; pin: string } // Device B sends generated PIN to signaling server
  | { type: "pair-confirm"; fromId: string; targetId: string; pin: string } // Device A confirms with PIN
  | { type: "pair-accept"; fromId: string; targetId: string }
  | { type: "pair-reject"; fromId: string; targetId: string }
  | {
      type: "sdp";
      fromId: string;
      targetId: string;
      sdp: { type: RTCSdpType; sdp: string };
    } // Session Description Protocol
  | {
      type: "ice";
      fromId: string;
      targetId: string;
      candidate: RTCIceCandidateInit;
    } // Interactive Connectivity Establishment
  | { type: "error"; message: string };

export type MessageOfType<T extends SignalMessage["type"]> = Extract<
  SignalMessage,
  { type: T }
>;

export interface TransferRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  direction: "sent" | "received";
  peerId: string;
  peerName: string;
  completedAt: number;
  downloadUrl?: string; // only exists on received files, created from the assembled blob
}

export interface TransferProgress {
  transferId: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  speedMBps: number;
  direction: "sending" | "receiving";
}
