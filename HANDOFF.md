# HANDOFF

Working log for the staged refactor. Stages 1–2 merged into `main` (988b67c).
Current: Stage 3 (features) on `feat/stage3-features`.

## Stage 3 decisions

- features: device naming, multi-file queue, pause/cancel/retry, folders
- queue: sequential per peer; queued items removable/reorderable
- controls: both sides pause/cancel (sender also resumes); retry on sender, same session
- folders: relativePath + groupId on file-meta; receiver downloads as streamed zip (fflate, OPFS)
- naming: localStorage, live via update-meta; history stores peer name at transfer time
- TDD seams: shared parsers, SignalingHub, web pure modules (no hook/component tests)
- two-device checks after steps 3, 7 and 10

## Stage 3 plan

- [x] 1. feat(shared): add update-meta signaling message
- [x] 2. feat(signaling): apply name updates and rebroadcast peers
- [ ] 3. feat(web): rename this device (two-device check)
- [ ] 4. feat(web): send files through a per-peer queue
- [ ] 5. feat(shared): add transfer control peer messages
- [ ] 6. feat(web): pause, resume and cancel transfers
- [ ] 7. feat(web): retry failed sends (two-device check)
- [ ] 8. feat(shared): add folder paths to file-meta
- [ ] 9. feat(web): send folders
- [ ] 10. feat(web): receive folders and download as zip (two-device check)

## Next 3 steps

1. feat(web): rename this device
2. feat(web): send files through a per-peer queue
3. feat(shared): add transfer control peer messages

## Half-done files

- none; on Render: set ALLOWED_ORIGINS, verify TRUST_PROXY/XFF; step 4 scopes accept waiters per peer

## Stage 2 (done, merged)

Reliability + security: register secret and peer-id ownership, origin/size limits, hardened
6-digit PIN, heartbeat, network-scoped discovery, resilient ws-client, ICE config/restart,
backpressure + adaptive chunks, OPFS streaming, resume and channel re-open, object URL cleanup.
Two-device checks passed. See git log 93006f0..988b67c.

## Stage 1 (done, merged)

Hygiene, scripts, CI, vitest, zod protocol in shared, signaling hub split with server-stamped
fromId, pairing and transfer reducers, peer-manager/chunk-utils/use-webrtc split, OsIcon.
Security fixes: PIN bound to approver; first-visit peer id. See git log 7cab8e2..93006f0.
