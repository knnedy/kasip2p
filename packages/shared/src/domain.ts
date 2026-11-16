import { z } from "zod";

export const osSchema = z.enum([
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
  "unknown",
]);
export type OS = z.infer<typeof osSchema>;

export const deviceTypeSchema = z.enum([
  "mobile",
  "tablet",
  "desktop",
  "unknown",
]);
export type DeviceType = z.infer<typeof deviceTypeSchema>;

export const peerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const peerMetaSchema = z.object({
  peerId: peerIdSchema,
  name: z.string().min(1).max(64),
  os: osSchema,
  deviceType: deviceTypeSchema,
});
export type PeerMeta = z.infer<typeof peerMetaSchema>;

export type ConnectionState =
  | "discovered"
  | "pairing"
  | "connected"
  | "transferring"
  | "disconnected";

export interface TransferRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  direction: "sent" | "received";
  peerId: string;
  peerName: string;
  completedAt: number;
  downloadUrl?: string; // only on received files, created from the assembled blob
}

export interface TransferProgress {
  transferId: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  speedMBps: number;
  direction: "sending" | "receiving";
}
