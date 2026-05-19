import type { SignalMessage } from "@kasip2p/shared";

type MessageHandler = (msg: SignalMessage) => void;

class SignalingClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(peerId: string) {
    const url = process.env.NEXT_PUBLIC_SIGNAL_URL;
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
      // attempt reconnect after 3s if connection drops
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
    return () => this.handlers.delete(handler); // returns cleanup function
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }
}

function getDeviceMeta(peerId: string) {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
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

  const deviceType = /Mobi|Android/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
      ? "tablet"
      : "desktop";

  return {
    peerId,
    name: `${navigator.platform} — ${navigator.appCodeName}`,
    os,
    deviceType,
  } as const;
}

export const signalingClient = new SignalingClient();
