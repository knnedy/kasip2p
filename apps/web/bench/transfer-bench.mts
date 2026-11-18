// Two-browser transfer benchmark: drives the real app (prod build) in system Chrome.
// Usage: pnpm bench [--size-mb 512] [--folder] [--headed] [--phone] [--cpu 6]. Needs ports 3001 and 3300 free.
// --phone sends from a phone-sized Android page; --cpu slows the sender's CPU that many times.
// --folder sends a nested folder (size split across files) and checks the zip with python3.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Page } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};

const SIZE_MB = opt("--size-mb", 256);
const WEB_PORT = 3300;
const APP = `http://localhost:${WEB_PORT}`;
const MB = 1024 * 1024;

const procs: ChildProcess[] = [];
function start(cmd: string, argv: string[], cwd: string, env: Record<string, string> = {}) {
  const p = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: "pipe" });
  p.stderr?.on("data", (d) => process.env.BENCH_VERBOSE && process.stderr.write(d));
  procs.push(p);
  return p;
}

async function waitForHttp(url: string, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`${url} did not come up`);
}

async function makeFile(dir: string, sizeMb: number) {
  const path = join(dir, `bench-${sizeMb}mb.bin`);
  const out = createWriteStream(path);
  const block = randomBytes(MB);
  for (let i = 0; i < sizeMb; i++) {
    if (!out.write(block)) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  await new Promise<void>((r) => out.end(() => r()));
  return path;
}

// photos/a.bin, photos/2024/b.bin, photos/2024/deep/c.bin, sizes summing to sizeMb.
async function makeFolder(dir: string, sizeMb: number) {
  const root = join(dir, "photos");
  const parts = ["a.bin", "2024/b.bin", "2024/deep/c.bin"];
  const shares = [Math.ceil(sizeMb / 2), Math.ceil(sizeMb / 4), 0];
  shares[2] = Math.max(1, sizeMb - shares[0]! - shares[1]!);
  for (const [i, rel] of parts.entries()) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    const made = await makeFile(dirname(join(root, rel)), shares[i]!);
    execFileSync("mv", [made, join(root, rel)]);
  }
  return root;
}

// Every file under root must appear in the zip as "photos/<rel>" with identical bytes.
function zipMatchesFolder(zipPath: string, root: string): boolean {
  const check = `
import hashlib, os, sys, zipfile
zip_path, root = sys.argv[1], sys.argv[2]
top = os.path.basename(root)
want = {}
for d, _, files in os.walk(root):
    for f in files:
        p = os.path.join(d, f)
        want[top + "/" + os.path.relpath(p, root)] = hashlib.sha256(open(p, "rb").read()).hexdigest()
z = zipfile.ZipFile(zip_path)
got = {i.filename: hashlib.sha256(z.read(i)).hexdigest() for i in z.infolist()}
sys.exit(0 if got == want and z.testzip() is None else 1)
`;
  try {
    execFileSync("python3", ["-I", "-c", check, zipPath, root]);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

// Ceiling: two RTCPeerConnections in one page, sending from memory as fast as allowed.
async function rawChannelMBps(page: Page, sizeMb: number): Promise<number> {
  return page.evaluate(async (total) => {
    const a = new RTCPeerConnection();
    const b = new RTCPeerConnection();
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
    const dc = a.createDataChannel("raw", { ordered: true });
    const received = new Promise<number>((resolve) => {
      b.ondatachannel = ({ channel }) => {
        channel.binaryType = "arraybuffer";
        let got = 0;
        channel.onmessage = ({ data }) => {
          got += (data as ArrayBuffer).byteLength;
          if (got >= total) resolve(performance.now());
        };
      };
    });
    await a.setLocalDescription();
    await b.setRemoteDescription(a.localDescription!);
    await b.setLocalDescription();
    await a.setRemoteDescription(b.localDescription!);
    await new Promise<void>((r) => (dc.onopen = () => r()));
    const chunk = new ArrayBuffer(Math.min(256 * 1024, a.sctp?.maxMessageSize ?? 65536));
    dc.bufferedAmountLowThreshold = 512 * 1024;
    const t0 = performance.now();
    for (let sent = 0; sent < total; sent += chunk.byteLength) {
      if (dc.bufferedAmount > 2 * 1024 * 1024) {
        await new Promise<void>((r) =>
          dc.addEventListener("bufferedamountlow", () => r(), { once: true }),
        );
      }
      dc.send(chunk);
    }
    const t1 = await received;
    a.close();
    b.close();
    return total / ((t1 - t0) / 1000) / (1024 * 1024);
  }, sizeMb * MB);
}

async function peerIdOf(page: Page) {
  await page.waitForFunction(() => localStorage.getItem("kasip2p-peer-id"));
  return page.evaluate(() => localStorage.getItem("kasip2p-peer-id")!);
}

async function main() {
  const root = new URL("../../..", import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), "kasip2p-bench-"));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    start("node", ["dist/index.js"], join(root, "apps/signaling"), { PORT: "3001" });
    start("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], join(root, "apps/web"));
    await waitForHttp("http://localhost:3001/ping");
    await waitForHttp(APP);

    const folderMode = flag("--folder");
    const file = folderMode ? await makeFolder(dir, SIZE_MB) : await makeFile(dir, SIZE_MB);
    browser = await chromium.launch({
      channel: "chrome",
      headless: !flag("--headed"),
      // same-machine peers: skip mDNS host-candidate obfuscation
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    });
    // two contexts = two devices (separate storage, peer ids, service workers)
    const sender = await (
      await browser.newContext(
        flag("--phone")
          ? {
              viewport: { width: 390, height: 844 },
              isMobile: true,
              hasTouch: true,
              userAgent:
                "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36",
            }
          : {},
      )
    ).newPage();
    const receiver = await (await browser.newContext({ acceptDownloads: true })).newPage();
    // record whether the sender keeps the screen on (phones freeze pages once it turns off)
    await sender.addInitScript(() => {
      const w = window as unknown as { __screenLock: string[] };
      w.__screenLock = [];
      const real = navigator.wakeLock?.request.bind(navigator.wakeLock);
      if (!real) return;
      navigator.wakeLock.request = async (type) => {
        const lock = await real(type);
        w.__screenLock.push("held");
        lock.addEventListener("release", () => w.__screenLock.push("released"));
        return lock;
      };
    });
    for (const page of [sender, receiver]) {
      page.on("console", (m) => m.type() === "error" && console.error(`[browser] ${m.text()}`));
      await page.goto(APP);
    }
    const [senderId, receiverId] = [await peerIdOf(sender), await peerIdOf(receiver)];
    // the download worker activates after the first load; reload so it is ready
    await receiver.reload();
    // .ready never resolves here: the worker's scope (/__downloads/) excludes this page
    await receiver.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration("/__downloads/"))?.active,
      undefined,
      { timeout: 10_000 },
    );

    const raw = await rawChannelMBps(sender, SIZE_MB);

    // pair through the real UI: sender requests, receiver accepts and shows the PIN
    await sender.goto(`${APP}/pair/${receiverId}`);
    await receiver.getByRole("button", { name: "accept" }).click();
    await receiver.waitForURL(`**/pair/${senderId}`);
    const pin = (await receiver.locator("[data-pin]").getAttribute("data-pin"))!;
    await sender.locator('input[inputmode="numeric"]').fill(pin);
    await sender.getByRole("button", { name: "Pair devices" }).click();
    await Promise.all([
      sender.waitForURL(`**/transfer/${receiverId}`),
      receiver.waitForURL(`**/transfer/${senderId}`),
    ]);

    const cpu = opt("--cpu", 1);
    if (cpu > 1) {
      const cdp = await sender.context().newCDPSession(sender);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    }
    // sender's progress over time, to show whether speed holds or collapses
    const samples: [number, number][] = [];
    const sampling = setInterval(() => {
      void sender
        .locator('[role="progressbar"]')
        .first()
        .getAttribute("aria-valuenow", { timeout: 200 })
        .then((v) => v !== null && samples.push([performance.now(), Number(v)]))
        .catch(() => {});
    }, 250);

    const downloadStarted = receiver.waitForEvent("download", { timeout: 10 * 60_000 });
    const t0 = performance.now();
    const input = folderMode ? "input[webkitdirectory]" : 'input[type="file"][multiple]';
    await sender.locator(input).setInputFiles(file);
    const download = await downloadStarted;
    const tFirst = performance.now();
    const savedPath = await download.path();
    const tDone = performance.now();
    clearInterval(sampling);
    const lockLog = await sender.evaluate(() => (window as unknown as { __screenLock: string[] }).__screenLock);
    await sender.waitForTimeout(1500); // transfer leaves the active list, lock should go
    const lockAfter = await sender.evaluate(() => (window as unknown as { __screenLock: string[] }).__screenLock);
    samples.push([tDone, 100]);

    const bytes = statSync(savedPath).size;
    const intact = folderMode
      ? download.suggestedFilename() === "photos.zip" && zipMatchesFolder(savedPath, file)
      : bytes === SIZE_MB * MB && (await sha256(savedPath)) === (await sha256(file));
    const seconds = (tDone - t0) / 1000;
    const app = SIZE_MB / seconds;

    const what = folderMode ? "folder → zip" : "file";
    console.log(`\nKasiP2P transfer benchmark (${SIZE_MB} MB ${what}, same machine, Chrome)`);
    console.table({
      "raw data channel": { "MB/s": raw.toFixed(1) },
      "app: file → download": { "MB/s": app.toFixed(1) },
    });
    console.log(`download appeared after ${((tFirst - t0) / 1000).toFixed(2)}s of ${seconds.toFixed(2)}s`);
    console.log(`streamed: ${tFirst - t0 < (tDone - t0) / 2 ? "yes" : "no (appeared at the end)"}`);
    console.log(`file intact: ${intact ? "yes" : `NO (${bytes} bytes)`}`);
    console.log(`app reaches ${((app / raw) * 100).toFixed(0)}% of the raw channel`);
    // time to cross each 25% mark, from the sender's progress bar
    const at = (pct: number) => samples.find(([, p]) => p >= pct)?.[0] ?? tDone;
    const marks = [t0, at(25), at(50), at(75), tDone];
    const quarters = marks.slice(1).map((t, i) => ((SIZE_MB / 4) / ((t - marks[i]!) / 1000)).toFixed(1));
    console.log(`screen kept on while sending: ${lockLog[0] === "held" ? "yes" : "no"}; released after: ${lockAfter.at(-1) === "released" ? "yes" : "no"}`);
    console.log(`MB/s per quarter: ${quarters.join(" → ")}${cpu > 1 ? ` (sender CPU ${cpu}× slower)` : ""}`);
    if (!intact) process.exitCode = 1;
  } finally {
    await browser?.close(); // before the servers, so pages don't log reconnect errors
    procs.forEach((p) => p.kill());
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  procs.forEach((p) => p.kill());
  process.exit(1);
});
