"use client";

import { useRouter } from "next/navigation";
import type { IncomingPairRequest } from "@/hooks/use-incoming-pair";
import { OsIcon } from "@/components/os-icon";
import { signalingClient } from "@/lib/signaling/ws-client";

interface Props {
  incoming: IncomingPairRequest;
  onDismiss: () => void;
}

// Another device asked to pair; its end is amber, like everywhere else.
export function PairRequestModal({ incoming, onDismiss }: Props) {
  const router = useRouter();
  const name = incoming.fromMeta?.name ?? "A device";

  function handleAccept() {
    // store in sessionStorage so the pair page knows this device is the receiver
    sessionStorage.setItem(`pair-request-${incoming.fromId}`, "true");
    onDismiss();
    router.push(`/pair/${incoming.fromId}`);
  }

  // tell the requester, or it waits on its code screen indefinitely
  function handleReject() {
    signalingClient.send({ type: "pair-reject", targetId: incoming.fromId });
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleReject} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-request-title"
        className="relative flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-them/12 text-them">
            {incoming.fromMeta && <OsIcon os={incoming.fromMeta.os} size={22} />}
          </span>
          <div className="min-w-0">
            <h2
              id="pair-request-title"
              className="truncate font-display text-lg font-bold font-stretch-semi-expanded text-foreground">
              {name} wants to pair
            </h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ll see a code to type on {name}.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAccept}
            autoFocus
            className="min-h-12 rounded-full bg-you font-medium text-background">
            Accept
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="min-h-12 rounded-full border border-border font-medium text-foreground transition-colors hover:bg-muted">
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
