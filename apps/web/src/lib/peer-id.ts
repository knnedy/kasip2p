import { generateId } from "@/lib/utils";

const ID_KEY = "kasip2p-peer-id";
const SECRET_KEY = "kasip2p-peer-secret";

function getOrCreate(key: string, create: () => string): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const value = create();
  localStorage.setItem(key, value);
  return value;
}

// Returns "" during SSR; on the client the id is created once and persisted.
export function getOrCreatePeerId(): string {
  return getOrCreate(ID_KEY, generateId);
}

// Sent with register so the server can refuse anyone else claiming our id.
export function getOrCreatePeerSecret(): string {
  return getOrCreate(SECRET_KEY, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  });
}
