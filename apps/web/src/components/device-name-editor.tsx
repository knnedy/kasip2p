"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Pencil, X } from "lucide-react";
import { deviceName, renameDevice } from "@/lib/signaling/ws-client";

// "This device: <name>" with inline rename; others see the change immediately.
export function DeviceNameEditor() {
  const name = useSyncExternalStore(
    deviceName.subscribe,
    deviceName.get,
    () => "",
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  function save() {
    if (draft === null) return;
    if (draft.trim() === name || renameDevice(draft)) {
      setDraft(null);
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  }

  function cancel() {
    setDraft(null);
    setInvalid(false);
  }

  if (draft === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>This device:</span>
        <span className="max-w-48 truncate font-medium text-foreground">
          {name}
        </span>
        <button
          type="button"
          onClick={() => setDraft(name)}
          aria-label="Rename this device"
          className="press -my-3 flex size-11 items-center justify-center rounded-full hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="device-name" className="text-xs text-muted-foreground">
          This device:
        </label>
        <input
          id="device-name"
          autoFocus
          value={draft}
          maxLength={64}
          aria-invalid={invalid}
          aria-describedby={invalid ? "device-name-error" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && cancel()}
          className="w-48 rounded-md border border-muted-foreground/60 bg-card px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-you"
        />
        <button
          type="submit"
          aria-label="Save name"
          className="press -my-3 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel rename"
          className="press -my-3 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {invalid && (
        <p
          id="device-name-error"
          role="alert"
          className="text-xs text-destructive"
        >
          Name must be 1–64 characters.
        </p>
      )}
    </form>
  );
}
