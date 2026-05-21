"use client";

import { useEffect, useRef, useState } from "react";
import { usePeers } from "@/hooks/use-peers";
import type { PeerEntry } from "@/hooks/use-peers";

function getOrCreatePeerId(): string {
  const stored = localStorage.getItem("kasip2p-peer-id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("kasip2p-peer-id", id);
  return id;
}

function getDeviceIcon(os: string) {
  switch (os) {
    case "android":
    case "ios":
      return "📱";
    case "macos":
      return "💻";
    case "windows":
      return "🖥️";
    case "linux":
      return "🐧";
    default:
      return "💻";
  }
}

export default function Home() {
  const [peerId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return getOrCreatePeerId();
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const angleRef = useRef<number>(0);

  const { peers } = usePeers(peerId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = Math.min(canvas.offsetWidth, canvas.offsetHeight);
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 16;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, size, size);

      for (let i = 1; i <= 4; i++) {
        const r = (maxR / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(99,220,177,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(99,220,177,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - maxR);
      ctx.lineTo(cx, cy + maxR);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy);
      ctx.lineTo(cx + maxR, cy);
      ctx.stroke();

      const sweepAngle = Math.PI / 3;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angleRef.current);

      const grad = ctx.createLinearGradient(0, 0, maxR, 0);
      grad.addColorStop(0, "rgba(29,158,117,0.6)");
      grad.addColorStop(1, "rgba(29,158,117,0)");

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, -sweepAngle / 2, sweepAngle / 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(maxR, 0);
      ctx.strokeStyle = "rgba(29,158,117,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(29,158,117,1)";
      ctx.fill();

      peers.forEach((peer, index) => {
        const angle = (index / Math.max(peers.length, 1)) * Math.PI * 2;
        const radius = maxR * 0.55;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(29,158,117,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(29,158,117,1)";
        ctx.fill();

        ctx.font = "12px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.fillText(peer.meta.name, x, y + 24);
      });

      angleRef.current += 0.012;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [peers]);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          KasiP2P
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {peers.length === 0
            ? "scanning for devices on your network..."
            : `${peers.length} device${peers.length > 1 ? "s" : ""} found`}
        </p>
      </div>

      <div className="relative w-85 h-85 md:w-120 md:h-120">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-full"
          style={{
            background: "radial-gradient(circle, #0a1a14 0%, #040d0a 100%)",
          }}
        />
      </div>

      {peers.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-sm">
          {peers.map((peer: PeerEntry) => (
            <button
              key={peer.meta.peerId}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent transition-colors">
              <span className="text-2xl">{getDeviceIcon(peer.meta.os)}</span>
              <div>
                <p className="text-sm font-medium text-foreground leading-none">
                  {peer.meta.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {peer.connectionState}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
