import { generateId } from "@/lib/utils";

const KEY = "kasip2p-peer-id";

// Returns "" during SSR; on the client the id is created once and persisted.
export function getOrCreatePeerId(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(KEY);
  if (stored) return stored;
  const id = generateId();
  localStorage.setItem(KEY, id);
  return id;
}
