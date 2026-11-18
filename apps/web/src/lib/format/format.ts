const UNITS = ["KB", "MB", "GB", "TB"];

// One decimal below 100 ("14.3 MB"), none above ("300 MB").
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 100 ? 1 : 0;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}

export function formatSpeed(mbPerSecond: number): string {
  if (!(mbPerSecond > 0)) return "—";
  if (mbPerSecond < 1) return `${Math.round(mbPerSecond * 1024)} KB/s`;
  return `${mbPerSecond.toFixed(1)} MB/s`;
}

export function formatEta(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  return `about ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export interface FailureCopy {
  title: string;
  hint: string | null;
}

const DROPPED = /data channel closed|peer did not reconnect|interrupted|still closed/;

// Raw transfer errors → what happened and what to do, from this side's view.
export function describeFailure(
  raw: string,
  direction: "sending" | "receiving",
  peer: string,
): FailureCopy {
  const reason = raw.replace(/^Error:\s*/, "");
  const byPeer = direction === "sending" ? "cancelled by receiver" : "cancelled by sender";
  const byMe = direction === "sending" ? /^cancelled$/ : /^cancelled by receiver/;

  if (reason.includes("download cancelled in the browser")) {
    return {
      title: reason.startsWith(byPeer) ? `${peer} cancelled the download` : "You cancelled the download",
      hint: null,
    };
  }
  if (reason.startsWith(byPeer)) return { title: `${peer} cancelled this`, hint: null };
  if (byMe.test(reason)) return { title: "You cancelled this", hint: null };
  if (DROPPED.test(reason)) {
    return {
      title: `Connection to ${peer} dropped`,
      hint: "Keep both screens on and on the same Wi-Fi, then try again.",
    };
  }
  if (reason.includes("did not accept")) {
    return { title: `${peer} didn't answer`, hint: `Check that KasiP2P is open on ${peer}.` };
  }
  if (reason.includes("disk full")) {
    return { title: "Not enough storage", hint: "Free up space on the receiving device." };
  }
  if (reason.includes("folder")) {
    return { title: "The folder stopped part-way", hint: "Send the whole folder again." };
  }
  return { title: "Something went wrong", hint: reason };
}
