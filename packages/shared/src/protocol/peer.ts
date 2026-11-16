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

export const peerMessageSchema = z.discriminatedUnion("type", [
  fileMetaSchema,
  fileAcceptSchema,
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
