import type { ClientMessage, ServerMessage } from "@kasip2p/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  BACKOFF_MAX_MS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  SignalingClient,
  WAKING_AFTER_MS,
  type SocketLike,
} from "./client";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // test helpers
  accept() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("backoffDelay", () => {
  it("grows exponentially, is capped, and has a floor", () => {
    expect(backoffDelay(0, () => 1)).toBe(500);
    expect(backoffDelay(3, () => 1)).toBe(4_000);
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(5, () => 0)).toBe(250);
  });
});

describe("SignalingClient", () => {
  let sockets: FakeSocket[];
  let client: SignalingClient;
  let onIdTaken: ReturnType<typeof vi.fn<() => void>>;
  const latest = () => sockets.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    onIdTaken = vi.fn<() => void>();
    client = new SignalingClient({
      url: () => "ws://signal",
      createSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      registerMessage: (peerId) => ({
        type: "register",
        meta: { peerId, name: "x", os: "linux", deviceType: "desktop" },
        secret: "a".repeat(32),
      }),
      onIdTaken,
      random: () => 1,
    });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it("registers on open and goes online", () => {
    client.connect("me");
    expect(client.getStatus()).toBe("connecting");
    latest().accept();
    expect(client.getStatus()).toBe("online");
    expect(latest().sent[0]).toMatchObject({ type: "register" });
  });

  it("queues messages until registered, then flushes them in order", () => {
    client.connect("me");
    client.send({ type: "pair-request", targetId: "bob" });
    expect(latest().sent).toEqual([]);
    latest().accept();
    expect(latest().sent.map((m) => m.type)).toEqual(["register", "pair-request"]);
  });

  it("shows 'waking' when the first connection is slow, across failed attempts", async () => {
    client.connect("me");
    latest().drop();
    await vi.advanceTimersByTimeAsync(WAKING_AFTER_MS);
    expect(client.getStatus()).toBe("waking");
    latest().drop();
    expect(client.getStatus()).toBe("waking");
  });

  it("reconnects with growing backoff and re-registers", async () => {
    client.connect("me");
    latest().accept();
    latest().drop();
    expect(client.getStatus()).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(499);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);

    latest().drop();
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    latest().accept();
    expect(client.getStatus()).toBe("online");
    expect(latest().sent[0]).toMatchObject({ type: "register" });
  });

  it("pings and reconnects when no reply arrives", async () => {
    client.connect("me");
    latest().accept();
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(latest().sent.at(-1)).toEqual({ type: "ping" });

    const first = latest();
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS);
    expect(first.closed).toBe(true);
    expect(client.getStatus()).toBe("reconnecting");
  });

  it("stays connected when pong arrives", async () => {
    client.connect("me");
    latest().accept();
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    latest().receive({ type: "pong" });
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS);
    expect(sockets).toHaveLength(1);
    expect(client.getStatus()).toBe("online");
  });

  it("delivers messages to handlers but hides pong and id conflicts", () => {
    const handler = vi.fn();
    client.onMessage(handler);
    client.connect("me");
    latest().accept();
    latest().receive({ type: "pong" });
    latest().receive({ type: "error", code: "peer-id-taken", message: "x" });
    latest().receive({ type: "pair-request", fromId: "bob" });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ type: "pair-request", fromId: "bob" });
    expect(onIdTaken).toHaveBeenCalledOnce();
  });

  it("stops reconnecting after disconnect", async () => {
    client.connect("me");
    latest().accept();
    client.disconnect();
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
    expect(client.getStatus()).toBe("idle");
  });
});
