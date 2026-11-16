import type { ServerMessage } from "@kasip2p/shared";
import { signalingClient } from "@/lib/signaling/ws-client";
import { rtcConfig } from "./ice-config";

const MAX_ICE_RESTARTS = 3;

// Deterministic so both sides agree without extra signaling, even after a reload.
export function isInitiator(localId: string, remoteId: string): boolean {
  return localId < remoteId;
}

export type ChannelData = string | ArrayBuffer;
type MessageHandler = (remoteId: string, data: ChannelData) => void;

// Owns RTCPeerConnections and data channels; no React. Started once per local id.
class PeerManager {
  private localId = "";
  private unsubscribe: (() => void) | null = null;
  private connections = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  private makingOffer = new Map<string, boolean>();
  private iceRestarts = new Map<string, number>();
  private handler: MessageHandler | null = null;
  private queued: [string, ChannelData][] = [];

  start(localId: string) {
    if (!localId || this.localId === localId) return;
    this.unsubscribe?.();
    this.localId = localId;
    this.unsubscribe = signalingClient.onMessage((msg) => {
      void this.handleSignal(msg);
    });
  }

  // Only the smaller id opens the channel; the other side receives it via ondatachannel.
  connect(remoteId: string) {
    if (!isInitiator(this.localId, remoteId)) return;
    const existing = this.channels.get(remoteId);
    if (existing && existing.readyState !== "closed") return;
    const pc = this.ensureConnection(remoteId);
    this.attachChannel(remoteId, pc.createDataChannel("files", { ordered: true }));
  }

  getOpenChannel(remoteId: string): RTCDataChannel | undefined {
    const dc = this.channels.get(remoteId);
    return dc?.readyState === "open" ? dc : undefined;
  }

  close(remoteId: string) {
    this.connections.get(remoteId)?.close();
    this.connections.delete(remoteId);
    this.channels.delete(remoteId);
    this.makingOffer.delete(remoteId);
    this.iceRestarts.delete(remoteId);
  }

  // Messages received while no handler is set are queued, then flushed here.
  setMessageHandler(handler: MessageHandler | null) {
    this.handler = handler;
    if (!handler) return;
    const pending = this.queued;
    this.queued = [];
    for (const [remoteId, data] of pending) handler(remoteId, data);
  }

  private deliver(remoteId: string, data: ChannelData) {
    if (this.handler) this.handler(remoteId, data);
    else this.queued.push([remoteId, data]);
  }

  private attachChannel(remoteId: string, dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer";
    dc.onmessage = ({ data }) => this.deliver(remoteId, data as ChannelData);
    this.channels.set(remoteId, dc);
  }

  private ensureConnection(remoteId: string): RTCPeerConnection {
    const existing = this.connections.get(remoteId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(rtcConfig());
    this.connections.set(remoteId, pc);

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.iceRestarts.set(remoteId, 0);
      if (pc.connectionState !== "failed") return;
      const restarts = this.iceRestarts.get(remoteId) ?? 0;
      if (restarts >= MAX_ICE_RESTARTS) {
        console.error(`connection to ${remoteId} failed after ${restarts} ICE restarts`);
        this.close(remoteId);
        return;
      }
      // fires negotiationneeded; the offer carries fresh ICE credentials
      this.iceRestarts.set(remoteId, restarts + 1);
      pc.restartIce();
    };

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.set(remoteId, true);
        await pc.setLocalDescription();
        this.sendDescription(remoteId, pc);
      } catch (err) {
        console.error("negotiation error", err);
      } finally {
        this.makingOffer.set(remoteId, false);
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      signalingClient.send({
        type: "ice",
        targetId: remoteId,
        candidate: candidate.toJSON(),
      });
    };

    pc.ondatachannel = ({ channel }) => this.attachChannel(remoteId, channel);

    return pc;
  }

  private sendDescription(remoteId: string, pc: RTCPeerConnection) {
    const desc = pc.localDescription;
    if (!desc) return;
    signalingClient.send({
      type: "sdp",
      targetId: remoteId,
      sdp: { type: desc.type, sdp: desc.sdp },
    });
  }

  private async handleSignal(msg: ServerMessage) {
    if (msg.type === "sdp") {
      await this.handleSdp(msg.fromId, msg.sdp);
    } else if (msg.type === "ice") {
      const pc = this.ensureConnection(msg.fromId);
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch (err) {
        console.error("ice candidate error", err);
      }
    }
  }

  // Perfect negotiation: the peer with the smaller id is polite and yields on glare.
  private async handleSdp(remoteId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.ensureConnection(remoteId);
    const polite = this.localId < remoteId;
    const offerCollision =
      sdp.type === "offer" &&
      ((this.makingOffer.get(remoteId) ?? false) || pc.signalingState !== "stable");

    if (!polite && offerCollision) return;

    try {
      await pc.setRemoteDescription(sdp);
      if (sdp.type === "offer") {
        await pc.setLocalDescription();
        this.sendDescription(remoteId, pc);
      }
    } catch (err) {
      console.error("sdp error", err);
    }
  }
}

export const peerManager = new PeerManager();
