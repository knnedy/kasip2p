# KasiP2P

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
| Frontend         | Next.js 14 App Router    |
| Styling          | Tailwind CSS + shadcn/ui |
| Language         | TypeScript throughout    |
| P2P protocol     | WebRTC RTCDataChannel    |
| Signaling        | Hono + ws (Node.js)      |
| Signaling host   | Render.com               |
| Frontend host    | Vercel                   |
| Transfer history | IndexedDB via idb-keyval |
| QR pairing       | qrcode.react             |

## Project structure

kasip2p/
├── apps/
│ ├── web/ # Next.js app → Vercel
│ └── signaling/ # Hono WebSocket server → Render
└── packages/
└── shared/ # Shared TypeScript types

## Local development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Setup

```bash
git clone https://github.com/your-username/kasip2p.git
cd kasip2p
pnpm install
```

### Environment variables

```bash
cp apps/web/.env.local
```

Open `apps/web/.env.local` and set:

```bash
NEXT_PUBLIC_SIGNAL_URL=ws://<your-lan-ip>:3001
```

Replace `<your-lan-ip>` with your machine's local IP address. On Linux run `ip addr` to find it. On macOS run `ifconfig`.

### Run

```bash
pnpm dev
```

This starts both the Next.js app on `http://localhost:3000` and the signaling server on `ws://localhost:3001`.

Open `http://localhost:3000` on your laptop and `http://<your-lan-ip>:3000` on any other device on the same network.

## Deployment

### Signaling server → Render

1. Connect your GitHub repo on [render.com](https://render.com)
2. Render auto-detects `render.yaml` and configures the service
3. Once deployed, copy your Render URL

### Web app → Vercel

1. Import your GitHub repo on [vercel.com](https://vercel.com)
2. Vercel auto-detects `vercel.json` and configures the build
3. Add this environment variable in the Vercel dashboard:
   NEXT_PUBLIC_SIGNAL_URL=wss://<your-render-url>

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
