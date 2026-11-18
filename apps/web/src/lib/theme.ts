export type Theme = "dark" | "light";
export const THEME_KEY = "kasip2p:theme";

interface RootLike {
  classList: { contains(c: string): boolean; toggle(c: string, on: boolean): boolean };
}
interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

// The <html> "dark" class is the truth; the pre-paint script in layout sets it first.
export function createThemeStore(root: (() => RootLike) | RootLike, storage: StorageLike) {
  const el = () => (typeof root === "function" ? root() : root);
  const listeners = new Set<() => void>();
  return {
    get: (): Theme => (el().classList.contains("dark") ? "dark" : "light"),
    set(theme: Theme) {
      el().classList.toggle("dark", theme === "dark");
      try {
        storage.setItem(THEME_KEY, theme);
      } catch {
        // applies for this visit only
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Runs before paint (inlined in <head>): light only if chosen, otherwise dark.
export const themeBootScript = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.classList.remove("dark")}catch(e){}`;
