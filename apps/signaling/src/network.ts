import { isIPv4, isIPv6 } from "node:net";

export const LOCAL_NETWORK = "local";

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

function expandV6(ip: string): string[] {
  const [head = "", tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(8 - h.length - t.length).fill("0") : [];
  return [...h, ...fill, ...t].map((x) => x.toLowerCase().padStart(4, "0"));
}

// Devices sharing a key see each other: same public IPv4, same IPv6 /64, or any private address.
export function networkKey(rawIp: string | undefined): string {
  if (!rawIp) return LOCAL_NETWORK;
  const ip = rawIp.trim().replace(/^::ffff:/i, "");

  if (isIPv4(ip)) return isPrivateV4(ip) ? LOCAL_NETWORK : `v4:${ip}`;
  if (!isIPv6(ip)) return LOCAL_NETWORK;

  const groups = expandV6(ip);
  const first = parseInt(groups[0] ?? "0", 16);
  const isLoopback = groups.slice(0, 7).every((g) => g === "0000") && groups[7] === "0001";
  const isUla = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  if (isLoopback || isUla || isLinkLocal) return LOCAL_NETWORK;
  return `v6:${groups.slice(0, 4).join(":")}`;
}

// Rightmost X-Forwarded-For entry is the one our proxy appended; earlier ones are client-supplied.
export function clientIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy && forwardedFor) {
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
    const last = header.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
    if (last) return last;
  }
  return remoteAddress;
}
