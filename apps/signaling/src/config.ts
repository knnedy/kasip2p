// Max inbound WebSocket frame; schemas keep valid messages well under this.
export const MAX_PAYLOAD_BYTES = 64 * 1024;

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

// An empty allow-list means any origin (local dev); production sets ALLOWED_ORIGINS.
export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  return allowed.includes(origin.replace(/\/$/, ""));
}
