import {
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from "@kasip2p/shared";
import { PairingRegistry } from "./pairing.js";
import { PeerRegistry } from "./peer-registry.js";

export interface Connection {
  send(msg: ServerMessage): void;
  isOpen(): boolean;
}

// Transport-agnostic signaling logic; index.ts wires it to ws.
export class SignalingHub {
  private peers = new PeerRegistry<Connection>();
  private pairing = new PairingRegistry();
  private peerIdOf = new Map<Connection, string>();

  handleRaw(conn: Connection, raw: string) {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.error(conn, "invalid-message", parsed.error);
      return;
    }
    this.handle(conn, parsed.message);
  }

  handleClose(conn: Connection) {
    const peerId = this.peerIdOf.get(conn);
    this.peerIdOf.delete(conn);
    if (!peerId || !this.peers.remove(peerId, conn)) return;
    this.pairing.removePeer(peerId);
    this.broadcastPeerList();
  }

  private handle(conn: Connection, msg: ClientMessage) {
    if (msg.type === "register") {
      const previous = this.peerIdOf.get(conn);
      if (previous && previous !== msg.meta.peerId) {
        this.peers.remove(previous, conn);
        this.pairing.removePeer(previous);
      }
      this.peerIdOf.set(conn, msg.meta.peerId);
      this.peers.set(msg.meta, conn);
      this.broadcastPeerList();
      return;
    }

    const fromId = this.peerIdOf.get(conn);
    if (!fromId || this.peers.get(fromId) !== conn) {
      this.error(conn, "not-registered", "register before sending messages");
      return;
    }

    switch (msg.type) {
      case "pair-request":
        this.forward(conn, msg.targetId, { type: "pair-request", fromId });
        break;
      case "pair-pin":
        this.pairing.setPin(fromId, msg.targetId, msg.pin);
        break;
      case "pair-confirm":
        if (!this.pairing.confirm(fromId, msg.targetId, msg.pin)) {
          this.error(conn, "incorrect-pin", "incorrect PIN");
          break;
        }
        this.forward(conn, msg.targetId, { type: "pair-accept", fromId });
        conn.send({ type: "pair-accept", fromId: msg.targetId });
        break;
      case "pair-reject":
        this.pairing.unpair(fromId, msg.targetId);
        this.forward(conn, msg.targetId, { type: "pair-reject", fromId });
        break;
      case "sdp":
      case "ice":
        // relaying SDP/ICE only after PIN confirmation stops unpaired peers connecting
        if (!this.pairing.isPaired(fromId, msg.targetId)) {
          this.error(conn, "unauthorized", "peers must pair first");
          break;
        }
        this.forward(
          conn,
          msg.targetId,
          msg.type === "sdp"
            ? { type: "sdp", fromId, sdp: msg.sdp }
            : { type: "ice", fromId, candidate: msg.candidate },
        );
        break;
    }
  }

  private forward(sender: Connection, targetId: string, msg: ServerMessage) {
    const target = this.peers.get(targetId);
    if (target?.isOpen()) {
      target.send(msg);
    } else {
      this.error(sender, "peer-unreachable", `peer ${targetId} is offline`);
    }
  }

  private broadcastPeerList() {
    const msg: ServerMessage = { type: "peer-list", peers: this.peers.list() };
    for (const conn of this.peers.connections()) {
      if (conn.isOpen()) conn.send(msg);
    }
  }

  private error(conn: Connection, code: ErrorCode, message: string) {
    if (conn.isOpen()) conn.send({ type: "error", code, message });
  }
}
