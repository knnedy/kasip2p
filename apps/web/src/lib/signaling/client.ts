import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@kasip2p/shared";

export type SignalingStatus =
  | "idle"
  | "connecting"
  | "waking" // first connection is slow: likely a cold-starting server
  | "online"
  | "reconnecting";

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export interface ClientDeps {
  url(): string;
  createSocket(url: string): SocketLike;
  registerMessage(peerId: string): ClientMessage;
  wake?(url: string): void;
  onIdTaken?(): void;
  random?(): number;
}

const OPEN = 1;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 30_000;
export const PING_INTERVAL_MS = 20_000;
export const PONG_TIMEOUT_MS = 10_000;
export const WAKING_AFTER_MS = 3_000;
const MAX_QUEUE = 50;

// Full-jitter exponential backoff with a small floor.
export function backoffDelay(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.max(250, Math.floor(random() * ceiling));
}

type Handler = (msg: ServerMessage) => void;
type StatusListener = (status: SignalingStatus) => void;

export class SignalingClient {
  private socket: SocketLike | null = null;
  private peerId = "";
  private status: SignalingStatus = "idle";
  private everOnline = false;
  private attempt = 0;
  private queue: ClientMessage[] = [];
  private handlers = new Set<Handler>();
  private statusListeners = new Set<StatusListener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private wakingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: ClientDeps) {}

  connect(peerId: string) {
    if (!peerId || this.peerId === peerId) return;
    this.peerId = peerId;
    this.deps.wake?.(this.deps.url());
    // survives fast failed attempts during a cold start; cleared once online
    this.wakingTimer = setTimeout(() => {
      if (this.status === "connecting") this.setStatus("waking");
    }, WAKING_AFTER_MS);
    this.open();
  }

  disconnect() {
    this.peerId = "";
    this.clearWakingTimer();
    this.teardown();
    this.setStatus("idle");
  }

  // Sent now when online, otherwise queued and flushed after re-registering.
  send(msg: ClientMessage) {
    if (this.status === "online" && this.socket?.readyState === OPEN) {
      this.socket.send(JSON.stringify(msg));
      return;
    }
    this.queue.push(msg);
    if (this.queue.length > MAX_QUEUE) this.queue.shift();
  }

  onMessage(handler: Handler) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  getStatus(): SignalingStatus {
    return this.status;
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private open() {
    this.teardown();
    if (this.everOnline) this.setStatus("reconnecting");
    else if (this.status !== "waking") this.setStatus("connecting");

    const socket = this.deps.createSocket(`${this.deps.url()}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.everOnline = true;
      this.clearWakingTimer();
      socket.send(JSON.stringify(this.deps.registerMessage(this.peerId)));
      this.setStatus("online");
      const pending = this.queue;
      this.queue = [];
      pending.forEach((m) => this.send(m));
      this.startHeartbeat();
    };

    socket.onmessage = (event) => {
      this.clearPongTimer();
      if (typeof event.data !== "string") return;
      const parsed = parseServerMessage(event.data);
      if (!parsed.ok) {
        console.error("invalid signal message", parsed.error);
        return;
      }
      const msg = parsed.message;
      if (msg.type === "pong") return;
      if (msg.type === "error" && msg.code === "peer-id-taken") {
        this.deps.onIdTaken?.();
        return;
      }
      this.handlers.forEach((h) => h(msg));
    };

    socket.onclose = () => this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (!this.peerId) return;
    this.teardown();
    if (this.everOnline) this.setStatus("reconnecting");
    const delay = backoffDelay(this.attempt++, this.deps.random ?? Math.random);
    this.later(delay, () => this.open());
  }

  private startHeartbeat() {
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState !== OPEN) return;
      this.socket.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
      this.clearPongTimer();
      // a half-open TCP connection may never fire onclose, so give up ourselves
      this.pongTimer = setTimeout(() => this.scheduleReconnect(), PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private clearWakingTimer() {
    if (this.wakingTimer) clearTimeout(this.wakingTimer);
    this.wakingTimer = null;
  }

  private clearPongTimer() {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private teardown() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPongTimer();
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private setStatus(status: SignalingStatus) {
    if (status === this.status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }
}
