import { getOrCreatePeerSecret, resetPeerIdentity } from "@/lib/peer-id";
import { SignalingClient, type SocketLike } from "./client";
import { getDeviceMeta } from "./device-meta";

export type { SignalingStatus } from "./client";

// Unset in dev: use the host serving the page, so LAN IP changes need no config.
function getSignalUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SIGNAL_URL || `ws://${window.location.hostname}:3001`
  );
}

function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => ws.send(data),
    close: () => ws.close(),
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (event) => socket.onmessage?.({ data: event.data });
  ws.onclose = () => socket.onclose?.();
  return socket;
}

export const signalingClient = new SignalingClient({
  url: getSignalUrl,
  createSocket: browserSocket,
  registerMessage: (peerId) => ({
    type: "register",
    meta: getDeviceMeta(peerId),
    secret: getOrCreatePeerSecret(),
  }),
  // an HTTP hit spins up a sleeping Render instance faster than WS retries alone
  wake: (url) => {
    void fetch(`${url.replace(/^ws/, "http")}/ping`, { mode: "no-cors" }).catch(
      () => {},
    );
  },
  onIdTaken: () => {
    resetPeerIdentity();
    window.location.reload();
  },
});
