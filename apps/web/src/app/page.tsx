"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePeers, type PeerEntry } from "@/hooks/use-peers";
import { usePairedPeers } from "@/hooks/use-paired-peers";
import { OsIcon } from "@/components/os-icon";
import { DeviceNameEditor } from "@/components/device-name-editor";
import { Wordmark } from "@/components/wordmark";
import { getOrCreatePeerId } from "@/lib/peer-id";

const OS_LABEL: Record<string, string> = {
  android: "Android",
  ios: "iPhone or iPad",
  macos: "Mac",
  windows: "Windows",
  linux: "Linux",
  unknown: "Device",
};

const noSubscribe = () => () => {};

function DeviceRow({ peer, paired, onOpen }: { peer: PeerEntry; paired: boolean; onOpen(): void }) {
  return (
    <li className="enter">
      <button
        type="button"
        onClick={onOpen}
        className="press group flex min-h-16 w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-them/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-them/12 text-them">
          <OsIcon os={peer.meta.os} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-semibold font-stretch-semi-expanded text-foreground">
            {peer.meta.name}
          </span>
          <span className="block text-sm text-muted-foreground">
            {OS_LABEL[peer.meta.os] ?? "Device"} · {paired ? "Paired" : "Not paired yet"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-them">
          {paired ? "Send" : "Pair"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </li>
  );
}

// No one else here yet: help open the app on the second device.
function OpenOnOtherDevice() {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const canCopy = useSyncExternalStore(noSubscribe, () => !!navigator.clipboard, () => false);
  const [copied, setCopied] = useState(false);
  const host = origin.replace(/^https?:\/\//, "");
  // another device can't reach "localhost"; point to the network address instead
  const local = /^(localhost|127\.|\[::1\])/.test(host);

  return (
    <div className="flex flex-col items-center gap-5 rounded-3xl border border-dashed border-border px-6 py-8 text-center sm:flex-row sm:text-left">
      {origin && !local && (
        <div className="shrink-0 rounded-2xl bg-foreground p-3">
          <QRCodeSVG value={origin} size={112} bgColor="transparent" fgColor="var(--background)" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="font-display font-semibold font-stretch-semi-expanded text-foreground">
          Open KasiP2P on your other device
        </p>
        <p className="text-sm text-muted-foreground">
          {local ? (
            <>
              Open this computer&apos;s network address on the other device (not{" "}
              <span className="font-mono text-foreground">{host}</span>).
            </>
          ) : (
            <>
              Scan the code or go to <span className="font-mono text-foreground">{host}</span>.
            </>
          )}{" "}
          Both devices need to be on the same Wi-Fi.
        </p>
        {canCopy && !local && (
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(origin).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
            className="press mx-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted sm:mx-0 sm:self-start">
            {copied ? <Check className="size-4 text-you" /> : <Copy className="size-4" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [peerId] = useState<string>(getOrCreatePeerId);
  const { peers } = usePeers(peerId);
  const paired = usePairedPeers();

  // paired devices first: they are one tap from sending
  const sorted = [...peers].sort(
    (a, b) => Number(paired.includes(b.meta.peerId)) - Number(paired.includes(a.meta.peerId)),
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-10 px-4 pt-6 pb-8 sm:pt-10">
      <header className="flex flex-col gap-4">
        <Wordmark />
        <DeviceNameEditor />
      </header>

      <section aria-labelledby="devices-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1
            id="devices-heading"
            className="font-display text-3xl font-bold tracking-tight text-balance font-stretch-expanded text-foreground sm:text-4xl">
            Send to a nearby device
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <span className="size-1.5 rounded-full bg-you motion-safe:animate-pulse" />
            {peers.length === 0
              ? "Looking for devices on your Wi-Fi…"
              : `${peers.length} device${peers.length > 1 ? "s" : ""} on your Wi-Fi`}
          </p>
        </div>

        {sorted.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {sorted.map((peer) => {
              const isPaired = paired.includes(peer.meta.peerId);
              return (
                <DeviceRow
                  key={peer.meta.peerId}
                  peer={peer}
                  paired={isPaired}
                  onOpen={() =>
                    router.push(`/${isPaired ? "transfer" : "pair"}/${peer.meta.peerId}`)
                  }
                />
              );
            })}
          </ul>
        ) : (
          <OpenOnOtherDevice />
        )}
      </section>

      <footer className="mt-auto text-sm text-muted-foreground">
        Files go straight from one device to the other. Nothing is uploaded.
      </footer>
    </main>
  );
}
