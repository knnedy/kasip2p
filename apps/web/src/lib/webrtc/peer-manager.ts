import type { ServerMessage } from "@kasip2p/shared";
import { signalingClient } from "@/lib/signaling/ws-client";
import { rtcConfig } from "./ice-config";
import { describeConnection, type ConnectionInfo } from "./connection-info";

const MAX_ICE_RESTARTS = 3;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
const OPEN_TIMEOUT_MS = 10_000;

// Each RTCPeerConnection has its own DTLS cert, so a new fingerprint means a new remote pc.
export function sdpFingerprint(sdp: string | undefined): string | null {
  const match = sdp?.match(/^a=fingerprint:(.+)$/m);
  return match ? match[1]!.trim() : null;
}

// Deterministic so both sides agree without extra signaling, even after a reload.
export function isInitiator(localId: string, remoteId: string): boolean {
  return localId < remoteId;
}

export type ChannelData = string | ArrayBuffer;
type MessageHandler = (remoteId: string, data: ChannelData) => void;
export type ChannelEvent = "open" | "close";
type ChannelListener = (remoteId: string, event: ChannelEvent) => void;

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
  private channelListeners = new Set<ChannelListener>();
  private wanted = new Set<string>(); // remotes we keep reconnecting to (initiator side)
  private reconnects = new Map<
    string,
    { attempt: number; timer: ReturnType<typeof setTimeout> | null }
  >();

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
    this.wanted.add(remoteId);
    const existing = this.channels.get(remoteId);
    if (existing && existing.readyState !== "closed") return;
    const pc = this.ensureConnection(remoteId);
    this.attachChannel(
      remoteId,
      pc.createDataChannel("files", { ordered: true }),
    );
  }

  getOpenChannel(remoteId: string): RTCDataChannel | undefined {
    const dc = this.channels.get(remoteId);
    return dc?.readyState === "open" ? dc : undefined;
  }

  // Small control messages (e.g. file-accept) on the open channel, if any.
  sendControl(remoteId: string, message: string) {
    this.getOpenChannel(remoteId)?.send(message);
  }

  // Resolves with the open channel, waiting for a reconnect if needed.
  waitForOpenChannel(
    remoteId: string,
    timeoutMs: number,
  ): Promise<RTCDataChannel> {
    const open = this.getOpenChannel(remoteId);
    if (open) return Promise.resolve(open);
    return new Promise((resolve, reject) => {
      const stop = this.onChannelEvent((id, event) => {
        const dc =
          id === remoteId && event === "open" && this.getOpenChannel(remoteId);
        if (!dc) return;
        clearTimeout(timer);
        stop();
        resolve(dc);
      });
      const timer = setTimeout(() => {
        stop();
        reject(new Error("peer did not reconnect"));
      }, timeoutMs);
    });
  }

  onChannelEvent(listener: ChannelListener) {
    this.channelListeners.add(listener);
    return () => {
      this.channelListeners.delete(listener);
    };
  }

  async getConnectionInfo(remoteId: string): Promise<ConnectionInfo | null> {
    const pc = this.connections.get(remoteId);
    return pc ? describeConnection(await pc.getStats()) : null;
  }

  // Remote's advertised SCTP max message size; undefined before the transport is up.
  getMaxMessageSize(remoteId: string): number | undefined {
    return this.connections.get(remoteId)?.sctp?.maxMessageSize;
  }

  // Deliberate disconnect: stops reconnecting too.
  close(remoteId: string) {
    this.wanted.delete(remoteId);
    const reconnect = this.reconnects.get(remoteId);
    if (reconnect?.timer) clearTimeout(reconnect.timer);
    this.reconnects.delete(remoteId);
    this.teardown(remoteId);
  }

  private teardown(remoteId: string) {
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
    const emit = (event: ChannelEvent) => {
      // ignore events from a channel that has since been replaced
      if (this.channels.get(remoteId) !== dc) return;
      if (event === "open") this.resetReconnect(remoteId);
      this.channelListeners.forEach((l) => l(remoteId, event));
      if (event === "close") this.scheduleReconnect(remoteId);
    };
    dc.onopen = () => emit("open");
    dc.onclose = () => emit("close");
    this.channels.set(remoteId, dc);
    if (dc.readyState === "open") emit("open");
  }

  private resetReconnect(remoteId: string) {
    const entry = this.reconnects.get(remoteId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.reconnects.delete(remoteId);
  }

  // Backoff, then a fresh channel (and pc if the old one is dead); retried until open.
  private scheduleReconnect(remoteId: string) {
    if (!this.wanted.has(remoteId)) return;
    const entry = this.reconnects.get(remoteId) ?? { attempt: 0, timer: null };
    if (entry.timer) return;
    const delay = RECONNECT_DELAYS_MS[entry.attempt];
    if (delay === undefined) {
      console.error(`gave up reconnecting to ${remoteId}`);
      return;
    }
    this.reconnects.set(remoteId, entry);
    entry.timer = setTimeout(() => {
      entry.attempt += 1;
      const pc = this.connections.get(remoteId);
      if (pc && pc.connectionState !== "connected") this.teardown(remoteId);
      this.connect(remoteId);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        if (!this.getOpenChannel(remoteId)) this.scheduleReconnect(remoteId);
      }, OPEN_TIMEOUT_MS);
    }, delay);
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
        console.error(
          `connection to ${remoteId} failed after ${restarts} ICE restarts`,
        );
        this.teardown(remoteId);
        this.scheduleReconnect(remoteId);
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
    const stale = this.connections.get(remoteId)?.remoteDescription;
    // the remote rebuilt its pc (we missed the drop), so start over with it
    if (
      sdp.type === "offer" &&
      stale &&
      sdpFingerprint(stale.sdp) !== sdpFingerprint(sdp.sdp)
    ) {
      this.teardown(remoteId);
    }
    const pc = this.ensureConnection(remoteId);
    const polite = this.localId < remoteId;
    const offerCollision =
      sdp.type === "offer" &&
      ((this.makingOffer.get(remoteId) ?? false) ||
        pc.signalingState !== "stable");

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
