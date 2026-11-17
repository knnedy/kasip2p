import { describe, expect, it, vi } from "vitest";
import { createDeviceNameStore, type StorageLike } from "./device-name";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("device name store", () => {
  it("uses the fallback until the user picks a name", () => {
    const names = createDeviceNameStore(memoryStorage(), () => "Linux desktop");
    expect(names.get()).toBe("Linux desktop");
  });

  it("saves a trimmed name and returns it", () => {
    const storage = memoryStorage();
    const names = createDeviceNameStore(storage, () => "fallback");
    expect(names.set("  Kitchen laptop ")).toBe("Kitchen laptop");
    expect(names.get()).toBe("Kitchen laptop");
    expect(createDeviceNameStore(storage, () => "fallback").get()).toBe("Kitchen laptop");
  });

  it("rejects blank or over-64-character names and keeps the old one", () => {
    const names = createDeviceNameStore(memoryStorage(), () => "fallback");
    names.set("Phone");
    expect(names.set("   ")).toBeNull();
    expect(names.set("x".repeat(65))).toBeNull();
    expect(names.get()).toBe("Phone");
  });

  it("ignores a corrupt stored value", () => {
    const names = createDeviceNameStore(memoryStorage({ "kasip2p:device-name": " " }), () => "fallback");
    expect(names.get()).toBe("fallback");
  });

  it("notifies subscribers on a valid rename only", () => {
    const names = createDeviceNameStore(memoryStorage(), () => "fallback");
    const listener = vi.fn();
    const unsubscribe = names.subscribe(listener);
    names.set("   ");
    names.set("Phone");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    names.set("Tablet");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("still renames for this session when storage is blocked", () => {
    const names = createDeviceNameStore(throwing, () => "fallback");
    expect(names.get()).toBe("fallback");
    expect(names.set("Phone")).toBe("Phone");
    expect(names.get()).toBe("Phone");
  });
});
