"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { createThemeStore, type Theme } from "@/lib/theme";

const theme = createThemeStore(
  () => document.documentElement,
  {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
  },
);

// Sun in dark mode (switch to light), moon in light mode (switch to dark).
export function ThemeToggle() {
  const current = useSyncExternalStore<Theme>(theme.subscribe, theme.get, () => "dark");
  const next: Theme = current === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => theme.set(next)}
      aria-label={`Switch to ${next} theme`}
      className="press -mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
      {current === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
