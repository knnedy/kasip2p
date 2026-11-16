import {
  parseServerMessage,
  type ClientMessage,
  type DeviceType,
  type OS,
  type PeerMeta,
  type ServerMessage,
} from "@kasip2p/shared";

type MessageHandler = (msg: ServerMessage) => void;

class SignalingClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(peerId: string) {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;

    this.socket = new WebSocket(`${getSignalUrl()}/ws`);

    this.socket.onopen = () => {
      this.send({ type: "register", meta: getDeviceMeta(peerId) });
    };

    this.socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const parsed = parseServerMessage(event.data);
      if (!parsed.ok) {
        console.error("invalid signal message", parsed.error);
        return;
      }
      this.handlers.forEach((h) => h(parsed.message));
    };

    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(peerId), 3000);
    };
  }

  send(msg: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}

// Unset in dev: use the host serving the page, so LAN IP changes need no config.
function getSignalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SIGNAL_URL || `ws://${window.location.hostname}:3001`
  );
}

function getDeviceMeta(peerId: string): PeerMeta {
  const ua = navigator.userAgent;

  const os: OS = /Android/i.test(ua)
    ? "android"
    : /iPhone|iPad/i.test(ua)
      ? "ios"
      : /Mac/i.test(ua)
        ? "macos"
        : /Win/i.test(ua)
          ? "windows"
          : /Linux/i.test(ua)
            ? "linux"
            : "unknown";

  const deviceType: DeviceType = /Mobi|Android/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
      ? "tablet"
      : "desktop";

  // server rejects empty or >64 char names; navigator.platform can be ""
  const name = (navigator.platform || "Unknown device").slice(0, 64);

  return { peerId, name, os, deviceType };
}

export const signalingClient = new SignalingClient();
