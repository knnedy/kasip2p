import type { SignalMessage, PeerMeta, OS, DeviceType } from "@kasip2p/shared";

type MessageHandler = (msg: SignalMessage) => void;

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

    const url = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:3001";
    this.socket = new WebSocket(`${url}/ws`);

    this.socket.onopen = () => {
      this.send({ type: "register", peerId, meta: getDeviceMeta(peerId) });
    };

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as SignalMessage;
        this.handlers.forEach((h) => h(msg));
      } catch {
        console.error("failed to parse signal message");
      }
    };

    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(peerId), 3000);
    };
  }

  send(msg: SignalMessage) {
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

  return {
    peerId,
    name: `${navigator.platform}`,
    os,
    deviceType,
  };
}

export const signalingClient = new SignalingClient();
