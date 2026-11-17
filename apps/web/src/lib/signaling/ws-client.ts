import { getOrCreatePeerSecret, resetPeerIdentity } from "@/lib/peer-id";
import { SignalingClient, type SocketLike } from "./client";
import { getDeviceMeta } from "./device-meta";
import { createDeviceNameStore } from "./device-name";
import { createPeerNames } from "./peer-names";
import { createPairedPeers } from "@/lib/pairing/paired-peers";

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

// Accessed lazily so SSR (no localStorage) falls through to the store's catch.
export const deviceName = createDeviceNameStore(
  {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
  },
  () => getDeviceMeta("").name, // only read in the browser
);

export const signalingClient = new SignalingClient({
  url: getSignalUrl,
  createSocket: browserSocket,
  registerMessage: (peerId) => ({
    type: "register",
    meta: { ...getDeviceMeta(peerId), name: deviceName.get() },
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

export const peerNames = createPeerNames();
export const pairedPeers = createPairedPeers({
  getItem: (k) => window.sessionStorage.getItem(k),
  setItem: (k, v) => window.sessionStorage.setItem(k, v),
});
signalingClient.onMessage((msg) => {
  if (msg.type === "peer-list") peerNames.update(msg.peers);
  pairedPeers.observe(msg);
});

// Saves locally and tells the network; returns null for an invalid name.
export function renameDevice(raw: string): string | null {
  const name = deviceName.set(raw);
  if (name) signalingClient.send({ type: "update-meta", name });
  return name;
}
