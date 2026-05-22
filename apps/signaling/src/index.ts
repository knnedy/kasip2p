import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import type { SignalMessage, PeerMeta } from "@kasip2p/shared";

const app = new Hono();
const wss = new WebSocketServer({ noServer: true });

const peers = new Map<string, { socket: WebSocket; meta: PeerMeta }>();
const pendingPins = new Map<string, string>();
const activePairings = new Set<string>();

app.get("/ping", (c) => c.text("kasip2p signaling online"));

function broadcast(msg: SignalMessage) {
  const data = JSON.stringify(msg);
  peers.forEach((peer) => peer.socket.send(data));
}

function getPeerList(): PeerMeta[] {
  return Array.from(peers.values()).map((peer) => peer.meta);
}

function getPairingKey(id1: string, id2: string) {
  return [id1, id2].sort().join(":");
}

function forward(
  targetId: string,
  msg: SignalMessage,
  senderSocket: WebSocket,
) {
  const target = peers.get(targetId);
  if (target) {
    target.socket.send(JSON.stringify(msg));
  } else {
    senderSocket.send(
      JSON.stringify({
        type: "error",
        message: `peer ${targetId} is unreachable or offline`,
      }),
    );
  }
}

wss.on("connection", (socket) => {
  let currentPeerId: string | null = null;

  socket.on("message", (raw) => {
    let msg: SignalMessage;

    try {
      msg = JSON.parse(raw.toString()) as SignalMessage;
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "invalid json" }));
      return;
    }

    switch (msg.type) {
      case "register": {
        currentPeerId = msg.peerId;
        peers.set(msg.peerId, { socket, meta: msg.meta });
        broadcast({ type: "peer-list", peers: getPeerList() });
        break;
      }
      case "pair-request": {
        forward(msg.targetId, msg, socket);
        break;
      }
      case "pair-pin": {
        // Device B registers the PIN it generated and displayed to its user
        const key = getPairingKey(msg.fromId, msg.targetId);
        pendingPins.set(key, msg.pin);
        break;
      }
      case "pair-confirm": {
        const key = getPairingKey(msg.fromId, msg.targetId);
        const expectedPin = pendingPins.get(key);
        if (expectedPin && expectedPin === msg.pin) {
          pendingPins.delete(key);
          activePairings.add(key);
          forward(
            msg.targetId,
            { type: "pair-accept", fromId: msg.fromId, targetId: msg.targetId },
            socket,
          );
          socket.send(
            JSON.stringify({
              type: "pair-accept",
              fromId: msg.targetId,
              targetId: msg.fromId,
            }),
          );
        } else {
          socket.send(
            JSON.stringify({ type: "error", message: "incorrect PIN" }),
          );
        }
        break;
      }
      case "pair-reject": {
        activePairings.delete(getPairingKey(msg.fromId, msg.targetId));
        forward(msg.targetId, msg, socket);
        break;
      }
      case "sdp":
      case "ice": {
        // only forward if peers have an active pairing — prevents rogue peers bypassing PIN
        const isPaired = activePairings.has(
          getPairingKey(msg.fromId, msg.targetId),
        );
        if (isPaired) {
          forward(msg.targetId, msg, socket);
        } else {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "unauthorized: peers must pair first",
            }),
          );
        }
        break;
      }
    }
  });

  socket.on("close", () => {
    if (currentPeerId) {
      const existing = peers.get(currentPeerId);
      // only delete if socket matches — prevents duplicate ID collision on quick refresh
      if (existing && existing.socket === socket) {
        peers.delete(currentPeerId);
        for (const pair of activePairings) {
          if (pair.includes(currentPeerId)) activePairings.delete(pair);
        }
        broadcast({ type: "peer-list", peers: getPeerList() });
      }
    }
  });
});

const port = Number(process.env["PORT"] ?? 3001);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`signaling server running on port: ${port}`);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
