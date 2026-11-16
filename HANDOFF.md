# HANDOFF

Working log for the staged refactor on `refactor/architecture`.

## Decisions (Stage 1)

- shared is consumed as source; signaling is bundled with tsup; web uses transpilePackages
- state machines are plain reducers (no XState)
- server stamps fromId from the socket (pulled into Stage 1 step 9)
- discovery scoping deferred to Stage 2
- vitest added in Stage 1

## Done

- chore(repo): remove committed build artifacts
- chore(web): remove Next.js boilerplate
- fix(web): remove reference to missing favicon.svg
- build(repo): add typecheck, lint, build scripts
- build(shared): consume shared as source; bundle signaling
- build(repo): add vitest
- docs(repo): fix README setup and add .env.example
- ci: add typecheck, lint, test, build workflow (not yet run on GitHub; nothing pushed)
- feat(shared): add zod signaling protocol (ClientMessage has no fromId; server stamps it)
- refactor(signaling): validate messages and stamp fromId (hub/pairing/peer-registry split, 11 tests)
- fix(signaling): bind PIN to the device that received the pair request
- build(shared): import with .ts extensions (Turbopack can't map .js -> .ts in shared source)
- refactor(web): validate signaling messages in ws-client (legacy SignalMessage removed)
- refactor(web): model pairing as a state machine (lib/pairing/machine.ts, 10 tests)
- refactor(web): add transfer state machine (lib/transfer/machine.ts, 7 tests; wired in next step)
- fix(web): create the peer id before the provider connects
- refactor(web): split peer-manager, chunk-utils, use-webrtc (4 chunk-utils tests)

## Next 3 steps

1. WAITING: user two-device smoke test of pair + transfer (not verifiable in CI)
2. refactor(web): extract shared OsIcon component
3. Stage 1 wrap-up: summary, then wait for Stage 2 approval

## Carried to Stage 2

- 0-byte files never complete on the receiver (totalChunks 0)
- whole file held in memory on receive; 16MB buffer threshold near Chrome's send-queue cap
- both sides call connect(): two "files" channels, last one wins
- progress dispatches per 64KB chunk (render pressure on fast LANs)
- register can take over another peer's id (needs a per-peer secret)
- discovery is global, not per network
- idb object URLs never revoked

## Half-done files

- none
