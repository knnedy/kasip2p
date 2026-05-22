"use client";

import { useRouter } from "next/navigation";
import { Zap, X } from "lucide-react";
import type { IncomingPairRequest } from "@/hooks/use-incoming-pair";
import type { OS } from "@kasip2p/shared";
import { siAndroid, siApple, siUbuntu, siLinux } from "simple-icons";

const ACCENT = "#00d9ff";

const windowsPath =
  "M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z";

function getOsIcon(os: OS) {
  switch (os) {
    case "android":
      return { path: siAndroid.path, color: ACCENT };
    case "ios":
    case "macos":
      return { path: siApple.path, color: "#f1f5f9" };
    case "windows":
      return { path: windowsPath, color: ACCENT };
    case "linux":
      return { path: siUbuntu.path, color: ACCENT };
    default:
      return { path: siLinux.path, color: "#f1f5f9" };
  }
}

function OsIcon({ os, size = 20 }: { os: OS; size?: number }) {
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

interface Props {
  incoming: IncomingPairRequest;
  onDismiss: () => void;
}

export function PairRequestModal({ incoming, onDismiss }: Props) {
  const router = useRouter();

  function handleAccept() {
    // store in sessionStorage so the pair page knows this device is the receiver
    sessionStorage.setItem(`pair-request-${incoming.fromId}`, "true");
    onDismiss();
    router.push(`/pair/${incoming.fromId}`);
  }

  function handleReject() {
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleReject}
      />

      {/* modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[#00d9ff]/20 bg-card p-6 shadow-2xl shadow-black/40">
        <button
          onClick={handleReject}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00d9ff]/20 bg-[#00d9ff]/5">
            {incoming.fromMeta && (
              <OsIcon os={incoming.fromMeta.os} size={28} />
            )}
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#00d9ff]">
              <Zap className="h-2.5 w-2.5 text-background" />
            </span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-foreground">
              connection request
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {incoming.fromMeta?.name ?? incoming.fromId}
              </span>{" "}
              wants to connect
            </p>
            {incoming.fromMeta && (
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                {incoming.fromMeta.os} · {incoming.fromMeta.deviceType}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleAccept}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00d9ff]/20 bg-[#00d9ff]/10 py-3 text-sm font-medium text-[#00d9ff] transition-all hover:bg-[#00d9ff]/20">
            <Zap className="h-4 w-4" />
            accept
          </button>
          <button
            onClick={handleReject}
            className="w-full rounded-xl border border-border bg-background py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            reject
          </button>
        </div>
      </div>
    </div>
  );
}
