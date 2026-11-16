import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import { SignalingHub, type Connection } from "./hub.ts";

const app = new Hono();
const wss = new WebSocketServer({ noServer: true });
const hub = new SignalingHub();

app.get("/ping", (c) => c.text("kasip2p signaling online"));

wss.on("connection", (socket) => {
  const conn: Connection = {
    send: (msg) => socket.send(JSON.stringify(msg)),
    isOpen: () => socket.readyState === WebSocket.OPEN,
  };

  socket.on("message", (raw) => hub.handleRaw(conn, raw.toString()));
  socket.on("close", () => hub.handleClose(conn));
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
