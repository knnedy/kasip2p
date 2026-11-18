# KasiP2P

**Kasi** (Swahili): _speed_.

Send files between your own devices over Wi-Fi. Open the app on two devices on the same network, pair them once with a 6-digit code, and send. Files go straight from one device to the other; nothing is uploaded.

## How it works

1. Open KasiP2P on both devices. Each one lists the other devices on your network.
2. Tap a device to pair. It asks the other device to accept, and the other device shows a code.
3. Type that code. The server checks it, then helps the two devices open a direct WebRTC connection.
4. Drop in files or a whole folder. They travel over the encrypted connection and land in the other device's Downloads (a folder arrives as one zip).

The signaling server only relays the handshake: device lists, pairing and connection setup, a few kilobytes of text. File bytes never pass through it.

## Features

- **Pairing:** a 6-digit code, checked by the server, so you connect to the device in front of you.
- **Direct transfers:** files and folders, with pause, resume, cancel and retry. Several files queue up one after another.
- **Honest progress:** the receiver confirms what arrived, so both screens show the same bytes and the live speed.
- **Big files:** received files stream straight to Downloads instead of sitting in memory. An interrupted file resumes where it stopped.
- **Phones:** the screen stays on during a transfer, so the phone doesn't freeze the send.
- **Device names and icons:** friendly default names like "Pixel 7", which you can rename.
- **Light and dark themes:** dark by default.
- **Private history:** a list of past transfers, kept only in your browser.

## Stack

| Part | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn |
| Signaling server | Hono + ws on Node.js |
| Shared protocol | TypeScript + zod schemas, validated at runtime on both ends |
| Transfers | WebRTC data channels |
| Storage | IndexedDB (history), a service worker for streamed downloads |
| Hosting | Vercel (web), Render (signaling) |

## Project layout

```
apps/
  web/          Next.js app
    src/app/        pages: home, pair/[peerId], transfer/[peerId]
    src/components/ UI, including the "wire" between two devices
    src/hooks/      React glue (use-webrtc, use-peers, …)
    src/lib/        transfer engine, signaling client, WebRTC, storage
    bench/          two-browser transfer benchmark
  signaling/    WebSocket server: discovery, pairing, handshake relay
packages/
  shared/       message schemas and types used by both apps
```

`packages/shared` ships TypeScript source with no build step. The web app compiles it via `transpilePackages`, and the signaling server bundles it with tsup.

## Run it locally

You need Node.js 24 or newer and pnpm 12 (`corepack enable` picks up the pinned version).

```bash
git clone https://github.com/knnedy/kasip2p.git
cd kasip2p
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

In `apps/web/.env.local`, set `ALLOWED_DEV_ORIGINS` to your computer's LAN IP, so your phone can load the dev server. Find the IP with `ip addr` on Linux or `ipconfig getifaddr en0` on macOS.

```bash
pnpm dev
```

This starts the web app on port 3000 and the signaling server on port 3001. Open `http://localhost:3000` on the computer and `http://<your-lan-ip>:3000` on the other device.

Leave `NEXT_PUBLIC_SIGNAL_URL` unset in development. The app then connects to port 3001 on whichever host served the page.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm bench   # real transfer between two Chrome tabs; see CONTRIBUTING.md
```

CI runs the first four on every push and pull request.

## Deploy

**Signaling server (Render).** Connect the repo on Render, which picks up `render.yaml`. In the dashboard, set `ALLOWED_ORIGINS` to your web app's URL (for example `https://kasip2p.vercel.app`). `TRUST_PROXY=true` is already set, so devices are grouped by their real network.

**Web app (Vercel).** Import the repo, set the root directory to `apps/web`, and add:

- `NEXT_PUBLIC_SIGNAL_URL=wss://<your-render-host>`
- Optionally, `NEXT_PUBLIC_ICE_SERVERS`, a JSON list of STUN/TURN servers, for devices on different networks. Without it, transfers stay on your local network. See `apps/web/.env.example`.

## Security and privacy

- Transfers are end-to-end encrypted by WebRTC (DTLS).
- The server relays connection setup only after the pairing code matches. Repeated wrong codes lock the attempt.
- Devices only discover others on the same network.
- File contents never touch a server. History and device names stay in your browser.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Kennedy Mwendwa
