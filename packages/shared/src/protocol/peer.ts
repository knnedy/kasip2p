import { z } from "zod";

// Control messages sent as strings over the RTCDataChannel; file bytes go as binary.
export const fileMetaSchema = z.object({
  type: z.literal("file-meta"),
  transferId: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0),
  mimeType: z.string().max(255),
  totalChunks: z.number().int().min(0),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

// Receiver's reply to file-meta: how many bytes it already has (0 = start fresh).
export const fileAcceptSchema = z.object({
  type: z.literal("file-accept"),
  transferId: z.string().min(1).max(64),
  offset: z.number().int().min(0),
});
export type FileAccept = z.infer<typeof fileAcceptSchema>;

// Either side may pause or cancel; resume is sent by whoever paused.
const transferIdSchema = z.string().min(1).max(64);
export const transferPauseSchema = z.object({
  type: z.literal("transfer-pause"),
  transferId: transferIdSchema,
});
export const transferResumeSchema = z.object({
  type: z.literal("transfer-resume"),
  transferId: transferIdSchema,
});
export const transferCancelSchema = z.object({
  type: z.literal("transfer-cancel"),
  transferId: transferIdSchema,
  reason: z.string().max(200).optional(),
});
export type TransferControl =
  | z.infer<typeof transferPauseSchema>
  | z.infer<typeof transferResumeSchema>
  | z.infer<typeof transferCancelSchema>;

export const peerMessageSchema = z.discriminatedUnion("type", [
  fileMetaSchema,
  fileAcceptSchema,
  transferPauseSchema,
  transferResumeSchema,
  transferCancelSchema,
]);
export type PeerMessage = z.infer<typeof peerMessageSchema>;

export function parsePeerMessage(raw: string): PeerMessage | null {
  try {
    const result = peerMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
