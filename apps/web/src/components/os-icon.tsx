import type { OS } from "@kasip2p/shared";
import { siAndroid, siApple, siUbuntu } from "simple-icons";


const genericDevicePath =
  "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v9h16V6zm3 13h10v2H7z";

const windowsPath =
  "M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z";

function getOsIcon(os: OS) {
  switch (os) {
    case "android":
      return siAndroid.path;
    case "ios":
    case "macos":
      return siApple.path;
    case "windows":
      return windowsPath;
    case "linux":
      return siUbuntu.path;
    default:
      return genericDevicePath; // unknown OS: a plain screen, not a guess
  }
}

export function OsIcon({ os, size = 20 }: { os: OS; size?: number }) {
  const path = getOsIcon(os); // coloured by the parent: the device's end, not its OS
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-label={os}>
      <path d={path} />
    </svg>
  );
}
