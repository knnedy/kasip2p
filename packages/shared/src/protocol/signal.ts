import { z } from "zod";
import { peerIdSchema, peerMetaSchema } from "../domain.ts";

export const pinSchema = z.string().regex(/^\d{4,8}$/);

// Random per-device value proving ownership of a peerId across reconnects.
export const peerSecretSchema = z.string().regex(/^[0-9a-f]{32,128}$/);

export const sdpSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().max(100_000),
});

export const iceCandidateSchema = z.object({
  candidate: z.string().max(1_000).optional(),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

// Client -> server. No fromId: the server stamps it from the registered socket.
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("register"),
    meta: peerMetaSchema,
    secret: peerSecretSchema,
  }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pair-request"), targetId: peerIdSchema }),
  z.object({
    type: z.literal("pair-pin"),
    targetId: peerIdSchema,
    pin: pinSchema,
  }),
  z.object({
    type: z.literal("pair-confirm"),
    targetId: peerIdSchema,
    pin: pinSchema,
  }),
  z.object({ type: z.literal("pair-reject"), targetId: peerIdSchema }),
  z.object({ type: z.literal("sdp"), targetId: peerIdSchema, sdp: sdpSchema }),
  z.object({
    type: z.literal("ice"),
    targetId: peerIdSchema,
    candidate: iceCandidateSchema,
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const errorCodeSchema = z.enum([
  "invalid-message",
  "not-registered",
  "peer-unreachable",
  "incorrect-pin",
  "unauthorized",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

// Server -> client. fromId is always set by the server, never trusted from a client.
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("peer-list"), peers: z.array(peerMetaSchema) }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("pair-request"), fromId: peerIdSchema }),
  z.object({ type: z.literal("pair-accept"), fromId: peerIdSchema }),
  z.object({ type: z.literal("pair-reject"), fromId: peerIdSchema }),
  z.object({ type: z.literal("sdp"), fromId: peerIdSchema, sdp: sdpSchema }),
  z.object({
    type: z.literal("ice"),
    fromId: peerIdSchema,
    candidate: iceCandidateSchema,
  }),
  z.object({
    type: z.literal("error"),
    code: errorCodeSchema,
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export type MessageOfType<
  M extends { type: string },
  T extends M["type"],
> = Extract<M, { type: T }>;

export type ParseResult<T> =
  | { ok: true; message: T }
  | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid json" };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error) };
  }
  return { ok: true, message: result.data };
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseWith(clientMessageSchema, raw);
}

export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseWith(serverMessageSchema, raw);
}
