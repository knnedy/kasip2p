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

## Next 3 steps

1. refactor(web): validate signaling messages in ws-client; drop legacy SignalMessage
2. refactor(web): model pairing as a state machine
3. refactor(web): model transfer as a state machine

## Notes for upcoming steps

- web must fall back when navigator.platform is empty (PeerMeta.name requires 1-64 chars)
- legacy.ts in shared is removed in the web ws-client step

## Half-done files

- none
