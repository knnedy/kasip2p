import { describe, expect, it, vi } from "vitest";
import { createThemeStore, THEME_KEY } from "./theme";

function fakes(saved: string | null = null) {
  const classes = new Set(["dark"]);
  const storage = new Map<string, string>(saved ? [[THEME_KEY, saved]] : []);
  return {
    classes,
    storage,
    root: {
      classList: {
        contains: (c: string) => classes.has(c),
        toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c), on),
      },
    },
    store: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
  };
}

describe("theme store", () => {
  it("reads the theme from the root class (dark by default)", () => {
    const f = fakes();
    expect(createThemeStore(f.root, f.store).get()).toBe("dark");
  });

  it("switches the class, remembers the choice and notifies", () => {
    const f = fakes();
    const theme = createThemeStore(f.root, f.store);
    const listener = vi.fn();
    theme.subscribe(listener);
    theme.set("light");
    expect(f.classes.has("dark")).toBe(false);
    expect(f.storage.get(THEME_KEY)).toBe("light");
    expect(theme.get()).toBe("light");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("still switches when storage is blocked", () => {
    const f = fakes();
    const theme = createThemeStore(f.root, {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    });
    theme.set("light");
    expect(theme.get()).toBe("light");
  });
});
