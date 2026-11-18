"use client";

import { useSyncExternalStore } from "react";
import type { OS } from "@kasip2p/shared";
import { deviceName } from "@/lib/signaling/ws-client";
import { getDeviceMeta } from "@/lib/signaling/device-meta";

const noSubscribe = () => () => {};

// This device's live name and OS, for drawing its end of the wire.
export function useThisDevice(): { name: string; os: OS } {
  const name = useSyncExternalStore(deviceName.subscribe, deviceName.get, () => "This device");
  const os = useSyncExternalStore(noSubscribe, () => getDeviceMeta("").os, () => "unknown" as OS);
  return { name, os };
}
