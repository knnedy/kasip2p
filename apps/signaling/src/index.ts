import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import {
  isOriginAllowed,
  MAX_PAYLOAD_BYTES,
  parseAllowedOrigins,
} from "./config.ts";
import { SignalingHub, type Connection } from "./hub.ts";

const app = new Hono();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
const hub = new SignalingHub();
const allowedOrigins = parseAllowedOrigins(process.env["ALLOWED_ORIGINS"]);

app.get("/ping", (c) => c.text("kasip2p signaling online"));

wss.on("connection", (socket) => {
  const conn: Connection = {
    send: (msg) => socket.send(JSON.stringify(msg)),
    isOpen: () => socket.readyState === WebSocket.OPEN,
  };

  socket.on("message", (raw) => hub.handleRaw(conn, raw.toString()));
  socket.on("close", () => hub.handleClose(conn));
  // without a listener, a bad frame (e.g. oversized) crashes the process; ws closes the socket
  socket.on("error", (err) => console.warn("socket error:", err.message));
});

const port = Number(process.env["PORT"] ?? 3001);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`signaling server running on port: ${port}`);
  if (allowedOrigins.length === 0) {
    console.warn("ALLOWED_ORIGINS unset: accepting WebSockets from any origin");
  }
});

server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path !== "/ws" || !isOriginAllowed(req.headers.origin, allowedOrigins)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
