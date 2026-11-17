# HANDOFF

Working log for the staged refactor. Stages 1–2 and Stage 3 steps 1–3 merged into `main` (b021907).
Current: Stage 3 (features) on `feat/stage3-features`.

## Stage 3 decisions

- features: device naming, multi-file queue, pause/cancel/retry, folders
- queue: sequential per peer; queued items removable/reorderable
- controls: both sides pause/cancel (sender also resumes); retry on sender, same session
- folders: relativePath + groupId on file-meta; receiver streams a zip into a browser download
- naming: localStorage, live via update-meta; history stores peer name at transfer time
- received files: stream into a normal browser download via service worker; fallback
  downloads on completion and deletes the temp copy; no big files kept in OPFS/IDB
- SW + OPFS need a secure context: LAN http dev on a phone uses the in-memory path
- TDD seams: shared parsers, SignalingHub, web pure modules (no hook/component tests)
- two-device checks after steps 3, 7, 14, 17 and 20; merge+push to main at each
- phase A (8-14) fixes and measures the pipeline before features; from step 10 the
  benchmark (`pnpm bench`) runs after every transfer-related step
- data path is direct on the network; speed work targets in-browser stops (sender
  stop-and-go reads, receive copy), measured by the benchmark

## Stage 3 plan

- [x] 1. feat(shared): add update-meta signaling message
- [x] 2. feat(signaling): apply name updates and rebroadcast peers
- [x] 3. feat(web): rename this device (two-device check)
- [x] 4. fix(web): render providers inside body
- [x] 5. fix(web): remember paired devices and skip re-pairing
- [x] 6. perf(web): batch disk writes when receiving
- [x] 7. feat(web): stream received files into browser downloads (two-device check)
- [x] 8. feat(shared): add transfer control peer messages
- [x] 9. fix(web): stop the sender when a download is cancelled
- [ ] 10. test(web): add two-browser transfer benchmark
- [ ] 11. fix(web): start streamed downloads in production builds
- [ ] 12. fix(web): drop file copies left in history by older versions
- [ ] 13. perf(web): read ahead on the sender and drop the receive copy
- [ ] 14. feat(web): show connection type and live speed (two-device check)
- [ ] 15. feat(web): send files through a per-peer queue
- [ ] 16. feat(web): pause, resume and cancel transfers
- [ ] 17. feat(web): retry failed sends (two-device check)
- [ ] 18. feat(shared): add folder paths to file-meta
- [ ] 19. feat(web): send folders (fixes stuck folder drop; hidden on phones)
- [ ] 20. feat(web): receive folders as a streamed zip download (two-device check)

## Next 3 steps

1. test(web): add two-browser transfer benchmark
2. fix(web): start streamed downloads in production builds
3. fix(web): drop file copies left in history by older versions

## Half-done files

- prod build: laptop receiver got no download (step 11); on Render: set ALLOWED_ORIGINS, verify TRUST_PROXY/XFF

## Stage 2 (done, merged)

Reliability + security: register secret and peer-id ownership, origin/size limits, hardened
6-digit PIN, heartbeat, network-scoped discovery, resilient ws-client, ICE config/restart,
backpressure + adaptive chunks, OPFS streaming, resume and channel re-open, object URL cleanup.
Two-device checks passed. See git log 93006f0..988b67c.

## Stage 1 (done, merged)

Hygiene, scripts, CI, vitest, zod protocol in shared, signaling hub split with server-stamped
fromId, pairing and transfer reducers, peer-manager/chunk-utils/use-webrtc split, OsIcon.
Security fixes: PIN bound to approver; first-visit peer id. See git log 7cab8e2..93006f0.
