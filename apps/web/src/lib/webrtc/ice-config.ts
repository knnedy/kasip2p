import { z } from "zod";

const iceServersSchema = z.array(
  z.object({
    urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    username: z.string().optional(),
    credential: z.string().optional(),
  }),
);

// Empty (LAN-only, host candidates) unless NEXT_PUBLIC_ICE_SERVERS opts in.
export function parseIceServers(raw: string | undefined): RTCIceServer[] {
  if (!raw?.trim()) return [];
  try {
    const result = iceServersSchema.safeParse(JSON.parse(raw));
    if (result.success) return result.data;
    console.warn("NEXT_PUBLIC_ICE_SERVERS is invalid; using none", result.error.issues);
  } catch {
    console.warn("NEXT_PUBLIC_ICE_SERVERS is not JSON; using none");
  }
  return [];
}

export function rtcConfig(): RTCConfiguration {
  return {
    iceServers: parseIceServers(process.env.NEXT_PUBLIC_ICE_SERVERS),
    iceTransportPolicy: "all",
  };
}
