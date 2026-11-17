import { deviceNameSchema } from "@kasip2p/shared";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "kasip2p:device-name";

// User-chosen name; memory copy keeps renames working when storage is blocked.
export function createDeviceNameStore(storage: StorageLike, fallback: () => string) {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  try {
    const parsed = deviceNameSchema.safeParse(storage.getItem(KEY));
    if (parsed.success) current = parsed.data;
  } catch {
    // private mode or blocked storage
  }

  return {
    get: () => current ?? fallback(),
    set(raw: string): string | null {
      const parsed = deviceNameSchema.safeParse(raw);
      if (!parsed.success) return null;
      current = parsed.data;
      try {
        storage.setItem(KEY, current);
      } catch {
        // kept in memory for this session
      }
      listeners.forEach((l) => l());
      return current;
    },
    // Shaped for useSyncExternalStore.
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
