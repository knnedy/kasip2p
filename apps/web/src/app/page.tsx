"use client";

import { useEffect, useRef, useState } from "react";
import { usePeers } from "@/hooks/use-peers";
import type { PeerEntry } from "@/hooks/use-peers";
import { siAndroid, siApple, siUbuntu, siLinux } from "simple-icons";
import type { OS } from "@kasip2p/shared";
import { Zap, Shield, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { generateId } from "@/lib/utils";

const ACCENT = "#00d9ff";
const ACCENT_DIM = "rgba(0,217,255,";

function getOrCreatePeerId(): string {
  const stored = localStorage.getItem("kasip2p-peer-id");
  if (stored) return stored;
  const id = generateId();
  localStorage.setItem("kasip2p-peer-id", id);
  return id;
}

const windowsPath =
  "M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z";

function getOsIcon(os: OS) {
  switch (os) {
    case "android":
      return { path: siAndroid.path, color: "#00d9ff" };
    case "ios":
    case "macos":
      return { path: siApple.path, color: "#f1f5f9" };
    case "windows":
      return { path: windowsPath, color: "#00d9ff" };
    case "linux":
      return { path: siUbuntu.path, color: "#00d9ff" };
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

function drawRadar(
  canvas: HTMLCanvasElement,
  peers: PeerEntry[],
  angle: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 16;

  ctx.clearRect(0, 0, size, size);

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  bg.addColorStop(0, "#071520");
  bg.addColorStop(1, "#020a0f");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR + 16, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 1; i <= 4; i++) {
    const r = (maxR / 4) * i;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = i === 4 ? `${ACCENT_DIM}0.2)` : `${ACCENT_DIM}0.07)`;
    ctx.lineWidth = i === 4 ? 1.5 : 1;
    ctx.stroke();
  }

  for (const [x1, y1, x2, y2] of [
    [cx, cy - maxR, cx, cy + maxR],
    [cx - maxR, cy, cx + maxR, cy],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1!, y1!);
    ctx.lineTo(x2!, y2!);
    ctx.strokeStyle = `${ACCENT_DIM}0.06)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const d = maxR * Math.cos(Math.PI / 4);
  for (const [x1, y1, x2, y2] of [
    [cx - d, cy - d, cx + d, cy + d],
    [cx + d, cy - d, cx - d, cy + d],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1!, y1!);
    ctx.lineTo(x2!, y2!);
    ctx.strokeStyle = `${ACCENT_DIM}0.03)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const sweepAngle = Math.PI / 3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const grad = ctx.createLinearGradient(0, 0, maxR, 0);
  grad.addColorStop(0, `${ACCENT_DIM}0.55)`);
  grad.addColorStop(0.5, `${ACCENT_DIM}0.15)`);
  grad.addColorStop(1, `${ACCENT_DIM}0)`);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, maxR, -sweepAngle / 2, sweepAngle / 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(maxR, 0);
  ctx.strokeStyle = `${ACCENT_DIM}0.9)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.strokeStyle = `${ACCENT_DIM}0.2)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();

  peers.forEach((peer, index) => {
    const a = (index / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = maxR * 0.58;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;

    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = `${ACCENT_DIM}0.12)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = `${ACCENT_DIM}0.35)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = `${ACCENT_DIM}0.1)`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();

    ctx.font = "500 11px sans-serif";
    ctx.fillStyle = "rgba(241,245,249,0.7)";
    ctx.textAlign = "center";
    ctx.fillText(peer.meta.name, x, y + 30);
  });
}

export default function Home() {
  const router = useRouter();
  const [peerId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return getOrCreatePeerId();
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef<number>(0);
  const peersRef = useRef<PeerEntry[]>([]);
  const { peers } = usePeers(peerId);

  // keep peersRef in sync without restarting the animation
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // start animation once canvas has real dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let started = false;

    function loop() {
      if (!canvas) return;
      drawRadar(canvas, peersRef.current, angleRef.current);
      angleRef.current += 0.01;
      animRef.current = requestAnimationFrame(loop);
    }

    const observer = new ResizeObserver(() => {
      const size = Math.min(canvas.offsetWidth, canvas.offsetHeight);
      if (size === 0 || started) return;
      canvas.width = size;
      canvas.height = size;
      started = true;
      loop();
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,217,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,217,255,0.03)_1px,transparent_1px)] bg-size-[64px_64px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,var(--background)_100%)]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-125 w-125 rounded-full bg-[#00d9ff]/3 blur-3xl" />
      </div>

      <div className="relative z-10 mb-10 flex flex-col items-center gap-4">
        <h1 className="text-6xl font-bold tracking-tight text-foreground">
          Kasi<span className="text-[#00d9ff]">P2P</span>
        </h1>

        <p className="max-w-sm text-center text-sm text-muted-foreground">
          open this page on any device on your network to connect instantly
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#00d9ff]/20 bg-[#00d9ff]/5 px-4 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00d9ff]" />
          <span className="text-xs font-medium text-muted-foreground">
            {peers.length === 0
              ? "scanning your network"
              : `${peers.length} device${peers.length > 1 ? "s" : ""} found`}
          </span>
        </div>
      </div>

      <div className="relative z-10 w-80 h-80 md:w-110 md:h-110">
        <canvas ref={canvasRef} className="h-full w-full rounded-full" />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#00d9ff]/15" />
      </div>

      {peers.length > 0 && (
        <div className="relative z-10 mt-10 w-full max-w-md px-4">
          <div className="mb-3 flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-[#00d9ff]" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              nearby devices
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {peers.map((peer: PeerEntry) => (
              <button
                onClick={() => router.push(`/pair/${peer.meta.peerId}`)}
                key={peer.meta.peerId}
                className="group flex w-full items-center gap-4 rounded-xl border border-[#00d9ff]/10 bg-card px-4 py-3 text-left transition-all duration-200 hover:border-[#00d9ff]/30 hover:bg-card/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#00d9ff]/20 bg-[#00d9ff]/5">
                  <OsIcon os={peer.meta.os} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {peer.meta.name}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {peer.meta.os} · {peer.connectionState}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#00d9ff]/20 bg-[#00d9ff]/5 px-3 py-1.5 transition-all group-hover:border-[#00d9ff]/40 group-hover:bg-[#00d9ff]/10">
                  <Zap className="h-3 w-3 text-[#00d9ff]" />
                  <span className="text-xs font-medium text-[#00d9ff]">
                    connect
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {peers.length === 0 && (
        <div className="relative z-10 mt-10 w-full max-w-lg px-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: Shield,
                title: "Private",
                desc: "Files never leave your network",
              },
              { icon: Zap, title: "Instant", desc: "Local network speeds" },
              {
                icon: Wifi,
                title: "Direct",
                desc: "Device to device, no cloud",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-2 rounded-xl border border-[#00d9ff]/10 bg-card px-4 py-5 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d9ff]/10">
                  <Icon className="h-4 w-4 text-[#00d9ff]" />
                </div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* footer */}
      <div className="relative z-10 mt-auto pt-16 pb-8 text-center">
        <p className="text-xs text-muted-foreground/50 flex items-center justify-center gap-2">
          <span className="hidden sm:inline">✓</span>
          <span>Zero cloud · Maximum privacy · Open source</span>
        </p>
      </div>
    </main>
  );
}
