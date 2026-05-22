"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { signalingClient } from "@/lib/signaling/ws-client";
import { usePeers } from "@/hooks/use-peers";
import { Zap, ArrowLeft, Shield } from "lucide-react";
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

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

type Role = "requester" | "receiver";
type PairingState = "waiting" | "accepted" | "rejected";

export default function PairPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params["peerId"] as string;

  const [localPeerId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("kasip2p-peer-id") ?? "";
  });

  const { peers } = usePeers(localPeerId);
  const targetPeer = peers.find((p) => p.meta.peerId === targetId);

  const [role] = useState<Role>(() => {
    if (typeof window === "undefined") return "requester";
    const key = `pair-request-${targetId}`;
    const incoming = sessionStorage.getItem(key);
    if (incoming) {
      sessionStorage.removeItem(key);
      return "receiver";
    }
    return "requester";
  });

  const [pin] = useState<string>(() => generatePin());
  const [pairingState, setPairingState] = useState<PairingState>("waiting");
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [pinError, setPinError] = useState<boolean>(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const qrValue = JSON.stringify({
    peerId: localPeerId,
    pin,
    action: "pair",
  });

  useEffect(() => {
    if (!localPeerId || !targetId) return;

    if (role === "receiver") {
      // Device B registers its PIN with the server
      signalingClient.send({
        type: "pair-pin",
        fromId: localPeerId,
        targetId,
        pin,
      });
    } else {
      // Device A sends the pair request
      signalingClient.send({
        type: "pair-request",
        fromId: localPeerId,
        targetId,
      });
    }

    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "pair-accept" && msg.fromId === targetId) {
        setPairingState("accepted");
        setTimeout(() => router.push(`/transfer/${targetId}`), 1200);
      }
      if (msg.type === "pair-reject" && msg.fromId === targetId) {
        setPairingState("rejected");
      }
      if (msg.type === "error") {
        setPinError(true);
        setEnteredPin("");
        pinInputRef.current?.focus();
      }
    });

    return () => cleanup();
  }, [localPeerId, targetId, pin, role, router]);

  function handlePinSubmit() {
    signalingClient.send({
      type: "pair-confirm",
      fromId: localPeerId,
      targetId,
      pin: enteredPin,
    });
  }

  function handleReject() {
    signalingClient.send({
      type: "pair-reject",
      fromId: localPeerId,
      targetId,
    });
    router.back();
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,217,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,217,255,0.03)_1px,transparent_1px)] bg-size-[64px_64px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,var(--background)_100%)]" />

      <button
        onClick={() => router.back()}
        className="absolute left-6 top-6 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        back
      </button>

      <div className="relative z-10 w-full max-w-sm">
        {targetPeer && (
          <div className="mb-8 flex items-center gap-3 rounded-xl border border-[#00d9ff]/15 bg-card px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#00d9ff]/20 bg-[#00d9ff]/5">
              <OsIcon os={targetPeer.meta.os} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {targetPeer.meta.name}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {targetPeer.meta.os}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00d9ff]" />
              <span className="text-xs text-muted-foreground">nearby</span>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#00d9ff]/15 bg-card p-6">
          {pairingState === "waiting" && role === "receiver" && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h2 className="text-xl font-bold text-foreground">
                  pair device
                </h2>
                <p className="text-xs text-muted-foreground">
                  show this PIN or QR code to the other device
                </p>
              </div>

              <div className="rounded-xl border border-[#00d9ff]/15 bg-white p-4">
                <QRCodeSVG
                  value={qrValue}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#020a0f"
                  level="M"
                />
              </div>

              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  your PIN
                </p>
                <div className="flex gap-3">
                  {pin.split("").map((digit, i) => (
                    <div
                      key={i}
                      className="flex h-14 w-12 items-center justify-center rounded-xl border border-[#00d9ff]/30 bg-[#00d9ff]/5 text-2xl font-bold text-[#00d9ff]">
                      {digit}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleReject}
                className="w-full rounded-lg border border-red-500/20 bg-red-500/5 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/10">
                reject
              </button>
            </div>
          )}

          {pairingState === "waiting" && role === "requester" && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h2 className="text-xl font-bold text-foreground">Enter PIN</h2>
                <p className="text-xs text-muted-foreground">
                  Enter the PIN shown on the other device
                </p>
              </div>

              <div className="flex w-full flex-col gap-3">
                <input
                  ref={pinInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                  value={enteredPin}
                  onChange={(e) => {
                    setPinError(false);
                    setEnteredPin(e.target.value.replace(/\D/g, ""));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                  className={`w-full rounded-xl border bg-background px-4 py-4 text-center text-3xl font-bold font-mono tracking-[1rem] text-foreground outline-none transition-colors ${
                    pinError
                      ? "border-red-500/50 text-red-400"
                      : "border-border focus:border-[#00d9ff]/40"
                  }`}
                />
                {pinError && (
                  <p className="text-center text-xs text-red-400">
                    incorrect PIN, try again
                  </p>
                )}
                <button
                  onClick={handlePinSubmit}
                  disabled={enteredPin.length !== 4}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00d9ff]/20 bg-[#00d9ff]/10 py-3 text-sm font-medium text-[#00d9ff] transition-all hover:bg-[#00d9ff]/20 disabled:opacity-40">
                  <Zap className="h-4 w-4" />
                  confirm
                </button>
              </div>
            </div>
          )}

          {pairingState === "accepted" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#00d9ff]/30 bg-[#00d9ff]/10">
                <Zap className="h-6 w-6 text-[#00d9ff]" />
              </div>
              <h2 className="text-xl font-bold text-foreground">connected</h2>
              <p className="text-xs text-muted-foreground">
                redirecting to transfer...
              </p>
            </div>
          )}

          {pairingState === "rejected" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                <Shield className="h-6 w-6 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                pairing rejected
              </h2>
              <p className="text-xs text-muted-foreground">
                the other device declined or is unreachable
              </p>
              <button
                onClick={() => router.back()}
                className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
                go back
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground/40">
          <Shield className="mr-1 inline h-3 w-3" />
          connection is end-to-end encrypted via DTLS
        </p>
      </div>
    </main>
  );
}
