"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Phone pickers ignore webkitdirectory (camera/photos only), so offer folders on
// fine-pointer devices that support it. False during SSR.
export function useCanPickFolders(): boolean {
  return useSyncExternalStore(
    noop,
    () =>
      "webkitdirectory" in HTMLInputElement.prototype &&
      window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
}
