import type { DeviceType, OS, PeerMeta } from "@kasip2p/shared";

export function getDeviceMeta(peerId: string): PeerMeta {
  const ua = navigator.userAgent;

  const os: OS = /Android/i.test(ua)
    ? "android"
    : /iPhone|iPad/i.test(ua)
      ? "ios"
      : /Mac/i.test(ua)
        ? "macos"
        : /Win/i.test(ua)
          ? "windows"
          : /Linux/i.test(ua)
            ? "linux"
            : "unknown";

  const deviceType: DeviceType = /Mobi|Android/i.test(ua)
    ? "mobile"
    : /Tablet|iPad/i.test(ua)
      ? "tablet"
      : "desktop";

  // server rejects empty or >64 char names; navigator.platform can be ""
  const name = (navigator.platform || "Unknown device").slice(0, 64);

  return { peerId, name, os, deviceType };
}
