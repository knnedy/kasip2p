# HANDOFF

Working log for the staged refactor. Stage 1 merged into `main`.

## Decisions (Stage 1)

- shared is consumed as source (.ts import specifiers); signaling bundled with tsup; web uses transpilePackages
- state machines are plain reducers (no XState)
- server stamps fromId from the socket; PIN bound to the approver of a pending request
- discovery scoping deferred
- vitest in every package

## Done (Stage 1: hygiene + architecture)

- chore(repo): remove committed build artifacts
- chore(web): remove Next.js boilerplate
- fix(web): remove reference to missing favicon.svg
- build(repo): add typecheck, lint, build scripts
- build(shared): consume shared as source; bundle signaling
- build(repo): add vitest
- docs(repo): fix README setup and add .env.example
- ci: add typecheck, lint, test, build workflow
- feat(shared): add zod signaling protocol
- refactor(signaling): validate messages and stamp fromId
- fix(signaling): bind PIN to the device that received the pair request
- build(shared): import with .ts extensions
- refactor(web): validate signaling messages in ws-client
- refactor(web): model pairing as a state machine
- refactor(web): add transfer state machine
- fix(web): create the peer id before the provider connects
- refactor(web): split peer-manager, chunk-utils, use-webrtc (two-device test passed)
- refactor(web): extract shared OsIcon component

## Next 3 steps

1. Plan Stage 2 (reliability + security) and wait for approval
2. Start with data channel throughput (user saw 0.4 MB/s phone<->laptop)
3. ws-client: reconnect/heartbeat, signal URL fallback to location.hostname

## Half-done files

- none

## Carried to Stage 2

- throughput: progress dispatch per 64KB chunk re-renders the page (likely cause of 0.4 MB/s);
  polling backpressure; chunk size not from sctp.maxMessageSize; not yet measured in a prod build
- 0-byte files never complete on the receiver (totalChunks 0)
- whole file held in memory on receive; 16MB buffer threshold near Chrome's send-queue cap
- both sides call connect(): two "files" channels, last one wins
- register can take over another peer's id (needs a per-peer secret)
- discovery is global, not per network
- idb object URLs never revoked
- dev setup breaks when LAN IP changes: NEXT_PUBLIC_SIGNAL_URL and allowedDevOrigins are hardcoded
