// Long enough for the browser to start the download before the URL dies.
export const REVOKE_AFTER_MS = 60_000;

type AnchorLike = { href: string; download: string; click(): void };

// Creates the object URL only on demand and always revokes it, so history never leaks blobs.
export function downloadBlob(
  blob: Blob,
  fileName: string,
  createAnchor: () => AnchorLike = () => document.createElement("a"),
) {
  const url = URL.createObjectURL(blob);
  try {
    const a = createAnchor();
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}
