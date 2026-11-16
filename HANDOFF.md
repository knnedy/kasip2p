# HANDOFF

Working log for the staged refactor. Stage 1 merged into `main` (93006f0).
Current: Stage 2 (reliability + security) on `feat/reliability-security`.

## Stage 2 decisions

- discovery scoped by public IP (x-forwarded-for)
- resume within the same session only (sender still holds the File)
- no default STUN; NEXT_PUBLIC_ICE_SERVERS opts in to STUN/TURN
- received files stream to OPFS, in-memory fallback
- PIN becomes 6 digits; peer-id ownership via a per-device secret
- two-device checks after steps 10, 12 and 15

## Stage 2 plan

- [x] chore pre-plan: fix(web) dev origins from env; chore(claude) project settings
- [x] 1. feat(shared): add register secret and ping/pong
- [x] 2. fix(signaling): limit message size and check origin
- [x] 3. feat(signaling): harden PIN pairing
- [x] 4. feat(signaling): heartbeat and stale-peer cleanup
- [ ] 5. fix(signaling): bind peer id to its owner
- [ ] 6. feat(signaling): scope discovery by network
- [ ] 7. feat(web): resilient ws-client
- [ ] 8. feat(web): generate 6-digit PIN with crypto
- [ ] 9. feat(web): configurable ICE servers and ICE restart
- [ ] 10. fix(web): open a single data channel per pair (two-device check)
- [ ] 11. perf(web): throttle progress updates
- [ ] 12. perf(web): event-driven backpressure and adaptive chunk size (two-device check)
- [ ] 13. fix(web): complete zero-byte transfers
- [ ] 14. feat(web): stream received files to disk
- [ ] 15. feat(web): resume interrupted transfers (two-device check)
- [ ] 16. fix(web): revoke object URLs

## Next 3 steps

1. fix(signaling): bind peer id to its owner
2. feat(signaling): scope discovery by network
3. feat(web): resilient ws-client

## Half-done files

- pair page ignores pin-expired/too-many-attempts errors until step 8

## Stage 1 (done, merged)

Hygiene, scripts, CI, vitest, zod protocol in shared, signaling hub split with server-stamped
fromId, pairing and transfer reducers, peer-manager/chunk-utils/use-webrtc split, OsIcon.
Security fixes: PIN bound to approver; first-visit peer id. See git log 7cab8e2..93006f0.
