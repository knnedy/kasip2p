# KasiP2P

Local-first P2P file sharing. pnpm monorepo: apps/web (Next.js, Tailwind, shadcn),
apps/signaling (Hono + ws, Render), packages/shared (shared types). Files move over
WebRTC data channels; the signaling server only relays handshake messages.

## Commands (adjust)

- Install: `pnpm install` (root only; one lockfile)
- Dev: `pnpm dev` (web :3000, signaling :3001)
- Typecheck/lint: `pnpm -r typecheck`, `pnpm -r lint`

## Rules

- Strict bottom-up dependency order; shared types first, then signaling, then web.
- Ask before big structural changes.
- Signaling message types live in packages/shared and are validated at runtime.
- Never route file data through the server.
- Comments max 2 lines. Conventional commits, one per feature.

## UI

- Tokens in globals.css are the source of truth. Use emil-design-eng for motion polish only.
- Respect prefers-reduced-motion.
