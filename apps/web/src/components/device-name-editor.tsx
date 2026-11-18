"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { renameDevice } from "@/lib/signaling/ws-client";
import { useThisDevice } from "@/hooks/use-this-device";
import { OsIcon } from "@/components/os-icon";

const MAX = 64;

// This device's end, in its colour: the name other devices see, renamed in place.
export function DeviceNameEditor() {
  const { name, os } = useThisDevice();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;

  // select the old name so typing replaces it
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  function save() {
    if (draft === null) return;
    const next = draft.trim();
    if (!next) return setError("Give this device a name.");
    if (next !== name && !renameDevice(next)) return setError(`Use up to ${MAX} characters.`);
    setDraft(null);
    setError(null);
    setSaved(next !== name);
  }

  function cancel() {
    setDraft(null);
    setError(null);
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-you/30 bg-card p-4">
      <span className="flex size-11 shrink-0 items-center justify-center self-start rounded-full border-2 border-you text-you">
        <OsIcon os={os} size={18} />
      </span>

      {!editing ? (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold font-stretch-semi-expanded text-foreground">
              {name}
            </p>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {saved ? (
                <span className="inline-flex items-center gap-1 text-you">
                  <Check className="size-3.5" /> Name saved
                </span>
              ) : (
                "This device"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDraft(name)}
            aria-label={`Rename this device, now called ${name}`}
            className="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
            <Pencil className="size-3.5" />
            Rename
          </button>
        </>
      ) : (
        <form
          className="flex min-w-0 flex-1 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}>
          <div className="flex flex-col gap-1">
            <label htmlFor="device-name" className="text-sm text-muted-foreground">
              Name for this device
            </label>
            <input
              id="device-name"
              ref={inputRef}
              autoFocus
              value={draft}
              maxLength={MAX}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby="device-name-help"
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Escape" && cancel()}
              className="h-12 w-full rounded-xl border border-muted-foreground/60 bg-background px-3 font-display text-lg font-semibold font-stretch-semi-expanded text-foreground outline-none focus:border-you aria-invalid:border-destructive"
            />
            <p id="device-name-help" className="flex justify-between gap-4 text-sm">
              {error ? (
                <span role="alert" className="text-destructive">
                  {error}
                </span>
              ) : (
                <span className="text-muted-foreground">Devices on your Wi-Fi see this name.</span>
              )}
              <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                {draft.length}/{MAX}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="press min-h-11 rounded-full bg-you px-5 font-medium text-background">
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="press min-h-11 rounded-full px-4 font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
