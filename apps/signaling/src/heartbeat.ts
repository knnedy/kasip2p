import type { WebSocket, WebSocketServer } from "ws";

// Pings every client each interval; one that missed the previous pong is terminated.
export function startHeartbeat(wss: WebSocketServer, intervalMs: number) {
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
  });

  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.get(socket)) {
        socket.terminate(); // fires "close", which runs hub cleanup
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
