"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderUp,
  Pause,
  Play,
  Plus,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import type { TransferProgress, TransferRecord } from "@kasip2p/shared";
import { getOrCreatePeerId } from "@/lib/peer-id";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useConnectionInfo } from "@/hooks/use-connection-info";
import { useCanPickFolders } from "@/hooks/use-can-pick-folders";
import { useThisDevice } from "@/hooks/use-this-device";
import { usePeers } from "@/hooks/use-peers";
import { QueuedFiles } from "@/components/queued-files";
import { FailedTransfers } from "@/components/failed-transfers";
import { SectionTitle } from "@/components/section-title";
import { TopBar } from "@/components/top-bar";
import { Wire } from "@/components/wire/wire";
import { summarizeWire } from "@/components/wire/wire-state";
import {
  collectEntries,
  pickedFromInput,
  planOutgoing,
  type EntryLike,
} from "@/lib/transfer/folders";
import type { ConnectionInfo } from "@/lib/webrtc/connection-info";
import { getTransfers } from "@/lib/store/idb";
import { pairedPeers, signalingClient, peerNames } from "@/lib/signaling/ws-client";
import { formatBytes, formatEta, formatSpeed } from "@/lib/format/format";
import { fileKind, groupByDay, type FileKind } from "@/lib/format/history";
import { cn } from "@/lib/utils";

const MB = 1024 * 1024;

const ROUTE_LABEL: Record<ConnectionInfo["route"], string> = {
  local: "Direct · your network",
  internet: "Direct · internet",
  relay: "Relayed · slower",
  unknown: "Connecting…",
};

function connectionLabel(info: ConnectionInfo | null) {
  if (!info || info.route === "unknown") return ROUTE_LABEL.unknown;
  return ROUTE_LABEL[info.route] + (info.rttMs !== null ? ` · ${info.rttMs} ms` : "");
}

function etaFor(t: { totalBytes: number; transferredBytes: number; speedMBps: number }) {
  if (!(t.speedMBps > 0)) return null;
  return formatEta((t.totalBytes - t.transferredBytes) / (t.speedMBps * MB));
}

const KIND_ICON: Record<FileKind, LucideIcon> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  text: FileText,
  sheet: FileSpreadsheet,
  other: File,
};

// Plain words when nothing is moving, instead of a bare "—".
function liveStatus(t: TransferProgress, peerName: string) {
  if (t.speedMBps > 0) return [formatSpeed(t.speedMBps), etaFor(t) && `${etaFor(t)} left`].filter(Boolean).join(" · ");
  return t.transferredBytes === 0 ? "Starting…" : `Waiting for ${peerName}…`;
}

const iconButton =
  "press flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground";

function ActiveTransfer({
  t,
  peerName,
  onControl,
}: {
  t: TransferProgress;
  peerName: string;
  onControl(action: "pause" | "resume" | "cancel"): void;
}) {
  const sending = t.direction === "sending";
  const fraction = t.totalBytes > 0 ? t.transferredBytes / t.totalBytes : 1;
  const pausedHere = t.pausedBy === "local" || t.pausedBy === "both";
  const status =
    t.pausedBy === "both"
      ? `Paused by you and ${peerName}`
      : t.pausedBy === "remote"
        ? `Paused by ${peerName}`
        : t.pausedBy === "local"
          ? "Paused"
          : liveStatus(t, peerName);

  return (
    <li className="enter flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            sending ? "bg-you/12 text-you" : "bg-them/12 text-them",
          )}>
          {sending ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          <span className="sr-only">{sending ? "Sending" : "Receiving"}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{t.fileName}</p>
          <p className="tabular truncate text-sm text-muted-foreground">{status}</p>
        </div>
        <button
          type="button"
          onClick={() => onControl(pausedHere ? "resume" : "pause")}
          aria-label={`${pausedHere ? "Resume" : "Pause"} ${t.fileName}`}
          className={iconButton}>
          {pausedHere ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => onControl("cancel")}
          aria-label={`Cancel ${t.fileName}`}
          className={cn(iconButton, "-mr-2")}>
          <X className="size-4" />
        </button>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${t.fileName} progress`}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}>
        {/* fill is coloured by the sending end */}
        <div
          className={cn(
            // linear: steady progress, retargeted every ~100ms update
            "h-full origin-left rounded-full transition-transform duration-200 ease-linear",
            sending ? "bg-you" : "bg-them",
            t.pausedBy && "opacity-50",
          )}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      <p className="tabular flex justify-between font-mono text-xs text-muted-foreground">
        <span>
          {formatBytes(t.transferredBytes)} of {formatBytes(t.totalBytes)}
        </span>
        <span>{Math.round(fraction * 100)}%</span>
      </p>
    </li>
  );
}

const TOAST_MS = 4_000;

// The newest record, if it finished while this page was open (not on first load).
function useJustFinished(newest: TransferRecord | undefined) {
  const [openedAt] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string | null>(null);
  const fresh = newest && newest.completedAt >= openedAt ? newest : undefined;
  const freshId = fresh?.id;
  useEffect(() => {
    if (!freshId) return;
    navigator.vibrate?.(30); // phones: a light tap
    const timer = setTimeout(() => setDismissed(freshId), TOAST_MS);
    return () => clearTimeout(timer);
  }, [freshId]);
  return fresh && fresh.id !== dismissed ? fresh : null;
}

export default function TransferPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params["peerId"] as string;

  const [localPeerId] = useState<string>(getOrCreatePeerId);

  const queryClient = useQueryClient();
  const { peers } = usePeers(localPeerId);
  const targetPeer = peers.find((p) => p.meta.peerId === targetId);
  const peerName = targetPeer?.meta.name ?? peerNames.get(targetId);
  const connection = useConnectionInfo(targetId);
  const you = useThisDevice();

  const { activeFor, failedFor, retry, dismiss, queue, initiate, send, control } = useWebRTC(
    localPeerId,
    () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
  );

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
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

  // fine pointer: desktop/laptop with drag and drop and folder picking
  const desktop = useCanPickFolders();

  // Picker input: folder picks carry webkitRelativePath. Reset so a re-pick fires.
  function handlePicked(input: HTMLInputElement) {
    if (input.files?.length) send(targetId, planOutgoing(pickedFromInput(input.files)));
    input.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    // entries must be taken during the event; dropped folders are walked after
    const entries = Array.from(e.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => !!entry);
    if (!entries.some((entry) => entry.isDirectory)) {
      send(targetId, Array.from(e.dataTransfer.files).map((file) => ({ file })));
      return;
    }
    void collectEntries(entries as unknown as EntryLike[])
      .then((picked) => send(targetId, planOutgoing(picked)))
      .catch((err) => console.warn("could not read the dropped folder", err));
  }

  const active = activeFor(targetId);
  const summary = summarizeWire(active);
  const failed = failedFor(targetId);
  const peerHistory = history.filter((h) => h.record.peerId === targetId);
  const pickFiles = () => fileInputRef.current?.click();
  const justFinished = useJustFinished(peerHistory[0]?.record);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 pt-4 pb-10">
      <TopBar>
        <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connection?.route === "relay"
                ? "bg-them"
                : connection && connection.route !== "unknown"
                  ? "bg-you"
                  : "bg-muted-foreground motion-safe:animate-pulse",
            )}
          />
          {connectionLabel(connection)}
        </p>
      </TopBar>

      <section className="flex flex-col gap-5" aria-labelledby="transfer-heading">
        <h1 id="transfer-heading" className="sr-only">
          Send files to {peerName}
        </h1>
        {/* announce state changes only; the speed itself updates too often to read out */}
        <p className="sr-only" aria-live="polite">
          {summary.flow === "idle"
            ? `Ready to send to ${peerName}`
            : summary.paused
              ? "Paused"
              : summary.flow === "receive"
                ? `Receiving from ${peerName}`
                : `Sending to ${peerName}`}
        </p>
        <Wire
          you={you}
          them={{ name: peerName, os: targetPeer?.meta.os ?? peerNames.meta(targetId)?.os }}
          route={connection?.route ?? "unknown"}
          summary={summary}
        />
        <div aria-hidden="true">
          {summary.flow === "idle" ? (
            <p className="font-display text-2xl font-bold tracking-tight text-balance font-stretch-expanded text-foreground">
              Ready to send to {peerName}
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="tabular font-display text-4xl font-bold tracking-tight font-stretch-expanded text-foreground">
                {summary.paused ? "Paused" : summary.speedMBps > 0 ? formatSpeed(summary.speedMBps) : "Waiting…"}
              </p>
              <p className="tabular text-muted-foreground">
                {Math.round((summary.progress ?? 0) * 100)}% done
                {!summary.paused &&
                  active.length === 1 &&
                  etaFor(active[0]!) &&
                  ` · ${etaFor(active[0]!)} left`}
              </p>
            </div>
          )}
        </div>
      </section>

      {desktop ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-6 text-center transition-colors",
            // the page's main job while idle; compact once something is moving
            summary.flow === "idle" ? "py-14" : "py-8",
            isDragging ? "border-you bg-you/5" : "border-border",
          )}>
          {summary.flow === "idle" && (
            <span className="flex size-12 items-center justify-center rounded-full bg-you/12 text-you">
              <Upload className="size-5" />
            </span>
          )}
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">
              {isDragging ? `Drop to send to ${peerName}` : "Drop files or folders here"}
            </p>
            {summary.flow === "idle" && !isDragging && (
              <p className="text-sm text-muted-foreground">
                They go straight to {peerName}. Nothing is uploaded.
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={pickFiles}
              className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-you px-5 font-medium text-background">
              <Plus className="size-4" />
              Choose files
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-medium text-foreground hover:bg-muted">
              <FolderUp className="size-4" />
              Choose a folder
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={pickFiles}
            className="press inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-you text-lg font-medium text-background">
            <Plus className="size-5" />
            Choose files
          </button>
          {summary.flow === "idle" && (
            <p className="text-center text-sm text-muted-foreground">
              They go straight to {peerName}. Nothing is uploaded.
            </p>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handlePicked(e.currentTarget)}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...{ webkitdirectory: "" }}
        onChange={(e) => handlePicked(e.currentTarget)}
      />

      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Now</SectionTitle>
          <ul className="flex flex-col gap-2">
            {active.map((t) => (
              <ActiveTransfer
                key={t.transferId}
                t={t}
                peerName={peerName}
                onControl={(action) => control(t.transferId, action)}
              />
            ))}
          </ul>
        </section>
      )}

      {failed.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Didn&apos;t finish</SectionTitle>
          <FailedTransfers items={failed} peerName={peerName} onRetry={retry} onDismiss={dismiss} />
        </section>
      )}

      <QueuedFiles queue={queue} peerId={targetId} />

      {peerHistory.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle>Earlier</SectionTitle>
          {groupByDay(peerHistory, (h) => h.record.completedAt).map((group) => (
            <div key={group.label} className="flex flex-col">
              <h3 className="pb-1 text-xs font-medium text-muted-foreground">{group.label}</h3>
              <ul className="flex flex-col">
                {group.items.map(({ record }) => (
                  <HistoryRow key={record.id} record={record} />
                ))}
              </ul>
            </div>
          ))}
          {peerHistory.some(({ record }) => record.direction === "received") && (
            <p className="text-sm text-muted-foreground">Received files are in your Downloads.</p>
          )}
        </section>
      )}

      {justFinished && <FinishedToast record={justFinished} peerName={peerName} />}
    </main>
  );
}

function HistoryRow({ record }: { record: TransferRecord }) {
  const sent = record.direction === "sent";
  const Icon = KIND_ICON[fileKind(record.mimeType, record.fileName)];
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          sent ? "bg-you/12 text-you" : "bg-them/12 text-them",
        )}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">{record.fileName}</p>
        <p className="tabular text-sm text-muted-foreground">
          {sent ? "Sent" : "Received"} · {formatBytes(record.fileSize)} ·{" "}
          {new Date(record.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </li>
  );
}

// Brief confirmation once a file lands, so finishing isn't silent.
function FinishedToast({ record, peerName }: { record: TransferRecord; peerName: string }) {
  const sent = record.direction === "sent";
  return (
    <div
      role="status"
      className="sheet-enter fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/20">
      <CircleCheck className={cn("size-5 shrink-0", sent ? "text-you" : "text-them")} />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{sent ? `Sent to ${peerName}` : "Saved to Downloads"}</p>
        <p className="truncate text-sm text-muted-foreground">{record.fileName}</p>
      </div>
    </div>
  );
}
