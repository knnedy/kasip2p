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

## Next 3 steps

1. feat(shared): add zod signaling protocol
2. refactor(signaling): validate inbound messages with shared protocol
3. refactor(web): validate signaling messages in ws-client

## Half-done files

- none
