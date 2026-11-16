import type { OS } from "@kasip2p/shared";
import { siAndroid, siApple, siLinux, siUbuntu } from "simple-icons";

const ACCENT = "#00d9ff";
const NEUTRAL = "#f1f5f9";

const windowsPath =
  "M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z";

function getOsIcon(os: OS) {
  switch (os) {
    case "android":
      return { path: siAndroid.path, color: ACCENT };
    case "ios":
    case "macos":
      return { path: siApple.path, color: NEUTRAL };
    case "windows":
      return { path: windowsPath, color: ACCENT };
    case "linux":
      return { path: siUbuntu.path, color: ACCENT };
    default:
      return { path: siLinux.path, color: NEUTRAL };
  }
}

export function OsIcon({ os, size = 20 }: { os: OS; size?: number }) {
  const { path, color } = getOsIcon(os);
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      aria-label={os}>
      <path d={path} />
    </svg>
  );
}
