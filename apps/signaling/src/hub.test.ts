import type { ServerMessage } from "@kasip2p/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { SignalingHub, type Connection } from "./hub.ts";

class FakeConn implements Connection {
  inbox: ServerMessage[] = [];
  open = true;
  constructor(readonly network = "local") {}
  send(msg: ServerMessage) {
    this.inbox.push(msg);
  }
  isOpen() {
    return this.open;
  }
  last() {
    return this.inbox.at(-1);
  }
  ofType<T extends ServerMessage["type"]>(type: T) {
    return this.inbox.filter((m) => m.type === type);
  }
}

function register(
  hub: SignalingHub,
  conn: FakeConn,
  peerId: string,
  secret = Buffer.from(peerId).toString("hex").padEnd(32, "0"),
) {
  hub.handleRaw(
    conn,
    JSON.stringify({
      type: "register",
      meta: { peerId, name: peerId, os: "linux", deviceType: "desktop" },
      secret,
    }),
  );
}

function send(hub: SignalingHub, conn: FakeConn, msg: object) {
  hub.handleRaw(conn, JSON.stringify(msg));
}

describe("SignalingHub", () => {
  let hub: SignalingHub;
  let a: FakeConn;
  let b: FakeConn;

  beforeEach(() => {
    hub = new SignalingHub();
    a = new FakeConn();
    b = new FakeConn();
    register(hub, a, "alice");
    register(hub, b, "bob");
  });

  function pair() {
    send(hub, a, { type: "pair-request", targetId: "bob" });
    send(hub, b, { type: "pair-pin", targetId: "alice", pin: "123456" });
    send(hub, a, { type: "pair-confirm", targetId: "bob", pin: "123456" });
  }

  it("broadcasts the peer list on register", () => {
    expect(a.last()).toEqual({
      type: "peer-list",
      peers: [
        expect.objectContaining({ peerId: "alice" }),
        expect.objectContaining({ peerId: "bob" }),
      ],
    });
  });

  it("answers ping with pong, even before register", () => {
    const fresh = new FakeConn();
    send(hub, fresh, { type: "ping" });
    expect(fresh.last()).toEqual({ type: "pong" });
  });

  it("rejects invalid messages with a typed error", () => {
    send(hub, a, { type: "pair-request" });
    expect(a.last()).toMatchObject({ type: "error", code: "invalid-message" });
  });

  it("rejects messages from unregistered sockets", () => {
    const stranger = new FakeConn();
    send(hub, stranger, { type: "pair-request", targetId: "bob" });
    expect(stranger.last()).toMatchObject({ type: "error", code: "not-registered" });
  });

  describe("peer id ownership", () => {
    let now: number;
    beforeEach(() => {
      now = 0;
      hub = new SignalingHub({ now: () => now, ownerGraceMs: 1_000 });
      a = new FakeConn();
      register(hub, a, "alice");
    });

    it("refuses another device registering a live peer id", () => {
      const mallory = new FakeConn();
      register(hub, mallory, "alice", "b".repeat(32));
      expect(mallory.last()).toMatchObject({ type: "error", code: "peer-id-taken" });
      const bob = new FakeConn();
      register(hub, bob, "bob");
      send(hub, bob, { type: "pair-request", targetId: "alice" });
      expect(a.last()).toEqual({ type: "pair-request", fromId: "bob" });
    });

    it("lets the owner reclaim its id after a reload", () => {
      hub.handleClose(a);
      const reloaded = new FakeConn();
      register(hub, reloaded, "alice");
      expect(reloaded.last()).toMatchObject({ type: "peer-list" });
    });

    it("keeps the id reserved during the grace period, then frees it", () => {
      hub.handleClose(a);
      const other = new FakeConn();
      register(hub, other, "alice", "b".repeat(32));
      expect(other.last()).toMatchObject({ code: "peer-id-taken" });
      now = 1_000;
      register(hub, other, "alice", "b".repeat(32));
      expect(other.last()).toMatchObject({ type: "peer-list" });
    });
  });

  describe("network scoping", () => {
    it("only lists peers on the same network", () => {
      const remote = new FakeConn("v4:41.90.1.2");
      register(hub, remote, "carol");
      expect(remote.last()).toEqual({
        type: "peer-list",
        peers: [expect.objectContaining({ peerId: "carol" })],
      });
      expect(a.last()).toEqual({
        type: "peer-list",
        peers: [
          expect.objectContaining({ peerId: "alice" }),
          expect.objectContaining({ peerId: "bob" }),
        ],
      });
    });

    it("does not relay pair requests across networks", () => {
      const remote = new FakeConn("v4:41.90.1.2");
      register(hub, remote, "carol");
      send(hub, remote, { type: "pair-request", targetId: "alice" });
      expect(remote.last()).toMatchObject({ type: "error", code: "peer-unreachable" });
      expect(a.ofType("pair-request")).toHaveLength(0);
    });
  });

  it("stamps fromId from the socket, ignoring a spoofed one", () => {
    send(hub, a, { type: "pair-request", fromId: "mallory", targetId: "bob" });
    expect(b.last()).toEqual({ type: "pair-request", fromId: "alice" });
  });

  it("accepts both sides on a correct PIN", () => {
    pair();
    expect(b.last()).toEqual({ type: "pair-accept", fromId: "alice" });
    expect(a.last()).toEqual({ type: "pair-accept", fromId: "bob" });
  });

  it("rejects a wrong PIN and does not pair", () => {
    send(hub, a, { type: "pair-request", targetId: "bob" });
    send(hub, b, { type: "pair-pin", targetId: "alice", pin: "123456" });
    send(hub, a, { type: "pair-confirm", targetId: "bob", pin: "999999" });
    expect(a.last()).toMatchObject({ type: "error", code: "incorrect-pin" });
    send(hub, a, { type: "sdp", targetId: "bob", sdp: { type: "offer", sdp: "v=0" } });
    expect(a.last()).toMatchObject({ type: "error", code: "unauthorized" });
  });

  it("does not let the requester set the PIN itself", () => {
    send(hub, a, { type: "pair-request", targetId: "bob" });
    send(hub, a, { type: "pair-pin", targetId: "bob", pin: "000000" });
    expect(a.last()).toMatchObject({ type: "error", code: "unauthorized" });
    send(hub, a, { type: "pair-confirm", targetId: "bob", pin: "000000" });
    expect(a.last()).toMatchObject({ type: "error", code: "incorrect-pin" });
    expect(b.ofType("pair-accept")).toHaveLength(0);
  });

  it("ignores a PIN for a peer that never requested pairing", () => {
    send(hub, b, { type: "pair-pin", targetId: "alice", pin: "123456" });
    expect(b.last()).toMatchObject({ type: "error", code: "unauthorized" });
    send(hub, a, { type: "pair-confirm", targetId: "bob", pin: "123456" });
    expect(a.last()).toMatchObject({ type: "error", code: "incorrect-pin" });
  });

  describe("PIN hardening", () => {
    let now: number;
    beforeEach(() => {
      now = 0;
      hub = new SignalingHub({ pairing: { now: () => now, ttlMs: 1_000, maxAttempts: 3 } });
      a = new FakeConn();
      b = new FakeConn();
      register(hub, a, "alice");
      register(hub, b, "bob");
      send(hub, a, { type: "pair-request", targetId: "bob" });
      send(hub, b, { type: "pair-pin", targetId: "alice", pin: "123456" });
    });

    const confirm = (pin: string) =>
      send(hub, a, { type: "pair-confirm", targetId: "bob", pin });

    it("rejects an expired PIN and tells the approver", () => {
      now = 1_000;
      confirm("123456");
      expect(a.last()).toMatchObject({ type: "error", code: "pin-expired" });
      expect(b.last()).toEqual({ type: "pair-reject", fromId: "alice" });
    });

    it("locks after too many wrong PINs, even if the next one is right", () => {
      confirm("000000");
      confirm("000000");
      expect(a.last()).toMatchObject({ code: "incorrect-pin" });
      confirm("000000");
      expect(a.last()).toMatchObject({ code: "too-many-attempts" });
      expect(b.last()).toEqual({ type: "pair-reject", fromId: "alice" });
      confirm("123456");
      expect(a.last()).toMatchObject({ code: "incorrect-pin" });
      expect(b.ofType("pair-accept")).toHaveLength(0);
    });

    it("refuses a PIN for a request that has expired", () => {
      send(hub, a, { type: "pair-request", targetId: "bob" });
      now = 1_001;
      send(hub, b, { type: "pair-pin", targetId: "alice", pin: "567890" });
      expect(b.last()).toMatchObject({ type: "error", code: "unauthorized" });
    });

    it("sweep drops expired state", () => {
      now = 2_000;
      hub.sweep();
      now = 0;
      confirm("123456");
      expect(a.last()).toMatchObject({ code: "incorrect-pin" });
    });
  });

  it("relays sdp and ice only between paired peers", () => {
    send(hub, a, { type: "sdp", targetId: "bob", sdp: { type: "offer", sdp: "v=0" } });
    expect(b.ofType("sdp")).toHaveLength(0);

    pair();
    send(hub, a, { type: "sdp", targetId: "bob", sdp: { type: "offer", sdp: "v=0" } });
    send(hub, b, { type: "ice", targetId: "alice", candidate: { candidate: "" } });
    expect(b.last()).toEqual({
      type: "sdp",
      fromId: "alice",
      sdp: { type: "offer", sdp: "v=0" },
    });
    expect(a.last()).toEqual({ type: "ice", fromId: "bob", candidate: { candidate: "" } });
  });

  it("blocks a third peer from spoofing a paired peer's sdp", () => {
    pair();
    const mallory = new FakeConn();
    register(hub, mallory, "mallory");
    send(hub, mallory, {
      type: "sdp",
      fromId: "alice",
      targetId: "bob",
      sdp: { type: "offer", sdp: "v=0" },
    });
    expect(mallory.last()).toMatchObject({ type: "error", code: "unauthorized" });
    expect(b.ofType("sdp")).toHaveLength(0);
  });

  it("reports unreachable targets", () => {
    send(hub, a, { type: "pair-request", targetId: "nobody" });
    expect(a.last()).toMatchObject({ type: "error", code: "peer-unreachable" });
  });

  it("drops the peer and its pairings on close", () => {
    pair();
    hub.handleClose(b);
    expect(a.last()).toEqual({
      type: "peer-list",
      peers: [expect.objectContaining({ peerId: "alice" })],
    });
    const b2 = new FakeConn();
    register(hub, b2, "bob");
    send(hub, a, { type: "sdp", targetId: "bob", sdp: { type: "offer", sdp: "v=0" } });
    expect(a.last()).toMatchObject({ type: "error", code: "unauthorized" });
  });

  it("keeps a refreshed socket when the old one closes late", () => {
    const b2 = new FakeConn();
    register(hub, b2, "bob");
    hub.handleClose(b);
    send(hub, a, { type: "pair-request", targetId: "bob" });
    expect(b2.last()).toEqual({ type: "pair-request", fromId: "alice" });
  });
});
