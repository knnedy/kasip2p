# KasiP2P

**Kasi** (Swahili) — _fast, speed, velocity_

Local-first peer-to-peer file sharing. Open the app on any two devices on the same network, pair them, and transfer files directly — no cloud, no intermediaries.

## How it works

1. Both devices open the app and appear on each other's radar
2. Device A clicks connect on Device B
3. Device B receives a pairing request, generates a PIN and displays it
4. Device A enters the PIN to confirm
5. A direct WebRTC connection is established between the two devices
6. Files transfer directly over the local network at full LAN speed

File data never leaves your network. The signaling server only handles the initial handshake (a few hundred bytes of text) and steps aside once the connection is established.

## Stack

| Concern          | Choice                   |
| ---------------- | ------------------------ |
| Frontend         | Next.js 16 App Router    |
| Styling          | Tailwind CSS + shadcn/ui |
| Language         | TypeScript throughout    |
| P2P protocol     | WebRTC RTCDataChannel    |
| Signaling        | Hono + ws (Node.js)      |
| Signaling host   | Render.com               |
| Frontend host    | Vercel                   |
| Transfer history | IndexedDB via idb-keyval |
| QR pairing       | qrcode.react             |

## Project structure

```
kasip2p/
├── apps/
│   ├── web/                         # Next.js app → Vercel
│   │   └── src/
│   │       ├── app/
│   │       │   ├── pair/[peerId]/   # Pairing flow
│   │       │   ├── transfer/[peerId]/ # File transfer UI
│   │       │   ├── layout.tsx
│   │       │   └── page.tsx         # Radar discovery page
│   │       ├── components/
│   │       │   └── pair-request-modal.tsx
│   │       ├── hooks/
│   │       │   ├── use-incoming-pair.ts
│   │       │   ├── use-peers.ts
│   │       │   └── use-webrtc.ts
│   │       ├── lib/
│   │       │   ├── signaling/
│   │       │   │   └── ws-client.ts
│   │       │   ├── store/
│   │       │   │   └── idb.ts
│   │       │   └── webrtc/
│   │       │       ├── chunk-utils.ts
│   │       │       └── peer-manager.ts
│   │       └── providers/
│   │           ├── pairing-provider.tsx
│   │           └── query-provider.tsx
│   └── signaling/                   # Hono WebSocket server → Render
│       └── src/
│           └── index.ts
└── packages/
    └── shared/                      # Shared TypeScript types
        └── src/
            └── index.ts
```

## Local development

### Prerequisites

- Node.js 22.18+
- pnpm 12 (`corepack enable` picks up the version pinned in `package.json`)

### Setup

```bash
git clone https://github.com/your-username/kasip2p.git
cd kasip2p
pnpm install
```

Run `pnpm install` from the repo root only; the workspace has a single lockfile.

### Environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

The signaling server reads `PORT` from the environment (default `3001`); see `apps/signaling/.env.example`.

Open `apps/web/.env.local` and set your machine's LAN IP so other devices may load the dev server:

```bash
ALLOWED_DEV_ORIGINS=<your-lan-ip>
```

On Linux run `ip addr` to find it; on macOS run `ifconfig`. Leave `NEXT_PUBLIC_SIGNAL_URL` unset in development: the client connects to port 3001 on whichever host served the page, so it keeps working when your IP changes. Set it only in production (see Deployment).

### Run

```bash
pnpm dev
```

This starts both the Next.js app on `http://localhost:3000` and the signaling server on `ws://localhost:3001`.

Open `http://localhost:3000` on your laptop and `http://<your-lan-ip>:3000` on any other device on the same network.

### Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

CI runs the same commands on every push and pull request.

### How packages consume `@kasip2p/shared`

`packages/shared` ships TypeScript source with no build step. The web app compiles it via `transpilePackages`; the signaling server bundles it into `dist/index.js` with tsup.

## Deployment

### Signaling server → Render

1. Connect your GitHub repo on [render.com](https://render.com)
2. Render auto-detects `render.yaml` and configures the service
3. Once deployed, copy your Render URL

### Web app → Vercel

1. Import your GitHub repo on [vercel.com](https://vercel.com)
2. Set the project's Root Directory to `apps/web` (Vercel detects Next.js and pnpm)
3. Add this environment variable in the Vercel dashboard:
   `NEXT_PUBLIC_SIGNAL_URL=wss://<your-render-url>`

## Security

- WebRTC data channels are encrypted end-to-end via DTLS
- The signaling server validates PIN confirmation before relaying any SDP or ICE messages
- A rogue device on the same network cannot intercept a transfer without knowing the PIN
- File data never passes through any server

## Features

- Animated radar showing live device discovery
- OS detection with platform icons for each device
- QR code + PIN pairing flow
- Drag and drop file transfer
- Real-time progress bars with transfer speed in MB/s
- Transfer history stored locally in IndexedDB
- Automatic reconnection if the signaling server drops
- Works on any device with a modern browser
