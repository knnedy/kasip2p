"use client";

import { useEffect, useReducer, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreatePeerId } from "@/lib/peer-id";
import { pairedPeers, peerNames, signalingClient } from "@/lib/signaling/ws-client";
import {
  initialPairingState,
  pairingReducer,
  type PairingRole,
} from "@/lib/pairing/machine";
import { usePeers } from "@/hooks/use-peers";
import { TopBar } from "@/components/top-bar";
import { Wire } from "@/components/wire/wire";
import { useThisDevice } from "@/hooks/use-this-device";
import { cn } from "@/lib/utils";
import { generatePin, PIN_LENGTH } from "@/lib/pairing/pin";

const FAILURE_COPY = {
  rejected: ["Pairing declined", "The other device said no. Ask them to accept, then try again."],
  unreachable: ["Device went offline", "Make sure KasiP2P is still open on the other device."],
  expired: ["The code expired", "Try again to get a new code."],
  locked: ["Too many wrong codes", "Try again to get a new code."],
} as const;

export default function PairPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params["peerId"] as string;

  const [localPeerId] = useState<string>(getOrCreatePeerId);

  const { peers } = usePeers(localPeerId);
  const targetPeer = peers.find((p) => p.meta.peerId === targetId);

  const [role] = useState<PairingRole>(() => {
    if (typeof window === "undefined") return "requester";
    const key = `pair-request-${targetId}`;
    const incoming = sessionStorage.getItem(key);
    if (incoming) {
      sessionStorage.removeItem(key);
      return "approver";
    }
    return "requester";
  });

  const [pin] = useState<string>(() => generatePin());
  const [state, dispatch] = useReducer(
    pairingReducer,
    role,
    initialPairingState,
  );
  const [enteredPin, setEnteredPin] = useState<string>("");
  const pinInputRef = useRef<HTMLInputElement>(null);
  const pinError = state.status === "awaiting-pin" && state.pinError;
  const failure =
    state.status in FAILURE_COPY
      ? FAILURE_COPY[state.status as keyof typeof FAILURE_COPY]
      : null;

  useEffect(() => {
    if (!localPeerId || !targetId) return;

    // already paired in this tab: the server still holds it, so skip the PIN
    if (role === "requester" && pairedPeers.has(targetId)) {
      router.replace(`/transfer/${targetId}`);
      return;
    }

    if (role === "approver") {
      // Device B registers its PIN with the server
      signalingClient.send({
        type: "pair-pin",
        targetId,
        pin,
      });
    } else {
      // Device A sends the pair request
      signalingClient.send({
        type: "pair-request",
        targetId,
      });
    }

    const cleanup = signalingClient.onMessage((msg) => {
      if (msg.type === "pair-accept" && msg.fromId === targetId) {
        dispatch({ type: "accepted" });
      }
      if (msg.type === "pair-reject" && msg.fromId === targetId) {
        dispatch({ type: "rejected" });
      }
      if (msg.type === "error" && msg.code === "incorrect-pin") {
        dispatch({ type: "pin-incorrect" });
        setEnteredPin("");
      }
      if (msg.type === "error" && msg.code === "peer-unreachable") {
        dispatch({ type: "unreachable" });
      }
      if (msg.type === "error" && msg.code === "pin-expired") {
        dispatch({ type: "expired" });
      }
      if (msg.type === "error" && msg.code === "too-many-attempts") {
        dispatch({ type: "locked" });
      }
    });

    return () => cleanup();
  }, [localPeerId, targetId, pin, role, router]);

  useEffect(() => {
    if (state.status !== "paired") return;
    // replace, so Back from transfers goes home instead of re-pairing
    const timer = setTimeout(() => router.replace(`/transfer/${targetId}`), 1200);
    return () => clearTimeout(timer);
  }, [state.status, router, targetId]);

  useEffect(() => {
    if (pinError) pinInputRef.current?.focus();
  }, [pinError]);

  function handlePinSubmit() {
    if (state.status !== "awaiting-pin" || enteredPin.length !== PIN_LENGTH) return;
    dispatch({ type: "pin-submitted" });
    signalingClient.send({
      type: "pair-confirm",
      targetId,
      pin: enteredPin,
    });
  }

  function handleReject() {
    signalingClient.send({
      type: "pair-reject",
      targetId,
    });
    router.back();
  }

  const you = useThisDevice();
  const them = {
    name: targetPeer?.meta.name ?? peerNames.get(targetId),
    os: targetPeer?.meta.os ?? peerNames.meta(targetId)?.os,
  };
  const idle = { flow: "idle", progress: null, speedMBps: 0, paused: false } as const;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-10 px-4 pt-4 pb-8">
      <TopBar />

      <Wire
        you={you}
        them={them}
        route={state.status === "paired" ? "local" : "unknown"}
        summary={idle}
      />

      <section className="flex flex-col gap-6" aria-live="polite">
        {state.status === "showing-pin" && (
          <>
            <Heading
              title={`Pair with ${them.name}`}
              body={`Type this code on ${them.name} to finish pairing.`}
            />
            <div
              data-pin={pin}
              aria-label={`Pairing code ${pin.split("").join(" ")}`}
              className="flex justify-between gap-2">
              {pin.split("").map((digit, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="flex h-16 flex-1 items-center justify-center rounded-2xl border border-border bg-card font-mono text-3xl font-semibold text-foreground">
                  {digit}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleReject}
              className="press min-h-11 self-center rounded-full px-4 text-sm text-muted-foreground hover:text-destructive">
              Don&apos;t pair
            </button>
          </>
        )}

        {(state.status === "awaiting-pin" || state.status === "verifying") && (
          <>
            <Heading
              title={`Pair with ${them.name}`}
              body={`Enter the code shown on ${them.name}.`}
            />
            <div className="flex flex-col gap-3">
              <label htmlFor="pin" className="sr-only">
                Pairing code
              </label>
              {/* one real input (paste, SMS autofill, one field for screen readers) drawn as boxes */}
              <div className="group relative">
                <input
                  id="pin"
                  ref={pinInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={PIN_LENGTH}
                  value={enteredPin}
                  aria-invalid={pinError || undefined}
                  aria-describedby={pinError ? "pin-error" : undefined}
                  onChange={(e) => {
                    dispatch({ type: "pin-edited" });
                    setEnteredPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                  className="absolute inset-0 h-full w-full cursor-text caret-transparent opacity-0"
                />
                <div aria-hidden="true" className="pointer-events-none flex justify-between gap-2">
                  {Array.from({ length: PIN_LENGTH }, (_, i) => {
                    // the box the next digit goes in; CSS shows the cursor only while focused
                    const current = i === Math.min(enteredPin.length, PIN_LENGTH - 1);
                    return (
                      <span
                        key={i}
                        className={cn(
                          "flex h-16 flex-1 items-center justify-center rounded-2xl border bg-card font-mono text-3xl font-semibold text-foreground transition-colors",
                          pinError
                            ? "border-destructive"
                            : current
                              ? "border-muted-foreground/60 group-has-[input:focus]:border-you group-has-[input:focus]:ring-2 group-has-[input:focus]:ring-you/30"
                              : "border-muted-foreground/60",
                        )}>
                        {enteredPin[i] ??
                          (current && (
                            <span className="hidden h-7 w-0.5 rounded-full bg-you group-has-[input:focus]:block motion-safe:animate-pulse" />
                          ))}
                      </span>
                    );
                  })}
                </div>
              </div>
              {pinError && (
                <p id="pin-error" className="text-sm text-destructive">
                  That code doesn&apos;t match. Check {them.name} and try again.
                </p>
              )}
              <button
                type="button"
                onClick={handlePinSubmit}
                disabled={enteredPin.length !== PIN_LENGTH || state.status === "verifying"}
                className="press min-h-12 rounded-full bg-you font-medium text-background disabled:opacity-40">
                {state.status === "verifying" ? "Checking…" : "Pair devices"}
              </button>
            </div>
          </>
        )}

        {state.status === "paired" && (
          <Heading title={`Paired with ${them.name}`} body="Opening transfers…" />
        )}

        {failure && (
          <>
            <Heading title={failure[0]} body={failure[1]} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="press min-h-11 flex-1 rounded-full bg-you font-medium text-background">
                Try again
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="press min-h-11 flex-1 rounded-full border border-border font-medium text-foreground hover:bg-muted">
                Back to devices
              </button>
            </div>
          </>
        )}
      </section>

      <p className="mt-auto text-sm text-muted-foreground">
        The code makes sure you&apos;re pairing with the device in front of you. Files are
        encrypted on the way.
      </p>
    </main>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-2xl font-bold tracking-tight text-balance font-stretch-expanded text-foreground">
        {title}
      </h1>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}
