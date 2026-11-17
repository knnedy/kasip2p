"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreatePeerId } from "@/lib/peer-id";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useConnectionInfo } from "@/hooks/use-connection-info";
import { QueuedFiles } from "@/components/queued-files";
import type { ConnectionInfo } from "@/lib/webrtc/connection-info";
import { usePeers } from "@/hooks/use-peers";
import { getTransfers } from "@/lib/store/idb";
import { pairedPeers, signalingClient } from "@/lib/signaling/ws-client";
import { ArrowLeft, Upload, Zap, CheckCircle, Clock, Pause, Play, X } from "lucide-react";
import { OsIcon } from "@/components/os-icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const ROUTE_LABEL: Record<ConnectionInfo["route"], string> = {
  local: "Direct · local network",
  internet: "Direct · over the internet",
  relay: "Relayed (slower)",
  unknown: "Connecting…",
};

function connectionLabel(info: ConnectionInfo | null) {
  if (!info) return ROUTE_LABEL.unknown;
  const rtt = info.rttMs !== null && info.route !== "unknown" ? ` · ${info.rttMs} ms` : "";
  return ROUTE_LABEL[info.route] + rtt;
}

export default function TransferPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params["peerId"] as string;

  const [localPeerId] = useState<string>(getOrCreatePeerId);

  const queryClient = useQueryClient();
  const { peers } = usePeers(localPeerId);
  const targetPeer = peers.find((p) => p.meta.peerId === targetId);
  const connection = useConnectionInfo(targetId);

  const { transfers, queue, initiate, send, control } = useWebRTC(localPeerId, () => {
    queryClient.invalidateQueries({ queryKey: ["transfers"] });
  });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initiated = useRef(false);

  // initiate is excluded from deps — it's a stable function reference
  // but we guard with initiated ref to ensure it only runs once
  useEffect(() => {
    if (!localPeerId || !targetId || initiated.current) return;
    initiated.current = true;
    initiate(targetId);
  }, [localPeerId, targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // the server forgot the pairing (e.g. it restarted): drop it and pair again
  useEffect(() => {
    return signalingClient.onMessage((msg) => {
      if (msg.type !== "error" || msg.code !== "unauthorized") return;
      pairedPeers.forget(targetId);
      router.replace(`/pair/${targetId}`);
    });
  }, [targetId, router]);

  const { data: history = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: getTransfers,
  });

  function handleFiles(files: FileList | null) {
    if (!files) return;
    send(targetId, Array.from(files));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const activeTransfers = transfers;
  const peerHistory = history.filter((h) => h.record.peerId === targetId);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,217,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,217,255,0.03)_1px,transparent_1px)] bg-size-[64px_64px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,var(--background)_100%)]" />

      <header className="relative z-10 flex items-center gap-4 border-b border-border px-6 py-4">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        {targetPeer && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#00d9ff]/20 bg-[#00d9ff]/5">
              <OsIcon os={targetPeer.meta.os} size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {targetPeer.meta.name}
              </p>
              <p className="text-xs capitalize text-muted-foreground">
                {targetPeer.meta.os}
              </p>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00d9ff]" />
          <span className="text-xs text-muted-foreground">
            {connectionLabel(connection)}
          </span>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-6 p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all duration-200 ${
            isDragging
              ? "border-[#00d9ff]/60 bg-[#00d9ff]/5"
              : "border-border hover:border-[#00d9ff]/30 hover:bg-[#00d9ff]/2"
          }`}>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors ${
              isDragging
                ? "border-[#00d9ff]/40 bg-[#00d9ff]/10"
                : "border-border bg-card"
            }`}>
            <Upload
              className={`h-6 w-6 transition-colors ${isDragging ? "text-[#00d9ff]" : "text-muted-foreground"}`}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isDragging ? "Drop to send" : "Drag files here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              or click to browse · any file type · any size
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <QueuedFiles queue={queue} peerId={targetId} />

        {activeTransfers.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-[#00d9ff]" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Transferring
              </p>
            </div>
            {activeTransfers.map((t) => {
              const pct = Math.round((t.transferredBytes / t.totalBytes) * 100);
              return (
                <div
                  key={t.transferId}
                  className="rounded-xl border border-[#00d9ff]/15 bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <p className="truncate text-sm font-medium text-foreground">
                      {t.fileName}
                    </p>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {t.pausedBy === "remote"
                          ? "Paused by other device"
                          : t.pausedBy === "local"
                            ? "Paused"
                            : `${t.speedMBps.toFixed(1)} MB/s`}
                      </span>
                      <span>{pct}%</span>
                      <button
                        type="button"
                        onClick={() => control(t.transferId, t.pausedBy === "local" ? "resume" : "pause")}
                        aria-label={`${t.pausedBy === "local" ? "Resume" : "Pause"} ${t.fileName}`}
                        className="rounded-md p-1 transition-colors hover:text-foreground">
                        {t.pausedBy === "local" ? (
                          <Play className="h-3.5 w-3.5" />
                        ) : (
                          <Pause className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => control(t.transferId, "cancel")}
                        aria-label={`Cancel ${t.fileName}`}
                        className="rounded-md p-1 transition-colors hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#00d9ff] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    <span>{formatBytes(t.transferredBytes)}</span>
                    <span>{formatBytes(t.totalBytes)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {peerHistory.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                History
              </p>
            </div>
            {peerHistory.map(({ record }) => (
              <div
                key={record.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                <CheckCircle className="h-4 w-4 shrink-0 text-[#00d9ff]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {record.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(record.fileSize)} ·{" "}
                    {record.direction === "sent" ? "sent" : "saved to Downloads"}{" "}
                    ·{" "}
                    {new Date(record.completedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
