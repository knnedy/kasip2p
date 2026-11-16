"use client";

import { useSyncExternalStore } from "react";
import { signalingClient, type SignalingStatus } from "@/lib/signaling/ws-client";

const subscribe = (cb: () => void) => signalingClient.onStatus(cb);
const getSnapshot = () => signalingClient.getStatus();
const getServerSnapshot = (): SignalingStatus => "idle";

export function useSignalingStatus(): SignalingStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
