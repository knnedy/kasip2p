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
- two-device checks after steps 3, 7, 11 and 14

## Stage 3 plan

- [x] 1. feat(shared): add update-meta signaling message
- [x] 2. feat(signaling): apply name updates and rebroadcast peers
- [x] 3. feat(web): rename this device (two-device check)
- [x] 4. fix(web): render providers inside body
- [x] 5. fix(web): remember paired devices and skip re-pairing
- [ ] 6. perf(web): batch disk writes when receiving
- [ ] 7. feat(web): stream received files into browser downloads (two-device check)
- [ ] 8. feat(web): send files through a per-peer queue
- [ ] 9. feat(shared): add transfer control peer messages
- [ ] 10. feat(web): pause, resume and cancel transfers
- [ ] 11. feat(web): retry failed sends (two-device check)
- [ ] 12. feat(shared): add folder paths to file-meta
- [ ] 13. feat(web): send folders (also fixes stuck folder drop; hidden on phones)
- [ ] 14. feat(web): receive folders as a streamed zip download (two-device check)

## Next 3 steps

1. perf(web): batch disk writes when receiving
2. feat(web): stream received files into browser downloads
3. feat(web): send files through a per-peer queue

## Half-done files

- rename check pending; on Render: set ALLOWED_ORIGINS, verify TRUST_PROXY/XFF; step 8 scopes accept waiters per peer

## Stage 2 (done, merged)

Reliability + security: register secret and peer-id ownership, origin/size limits, hardened
6-digit PIN, heartbeat, network-scoped discovery, resilient ws-client, ICE config/restart,
backpressure + adaptive chunks, OPFS streaming, resume and channel re-open, object URL cleanup.
Two-device checks passed. See git log 93006f0..988b67c.

## Stage 1 (done, merged)

Hygiene, scripts, CI, vitest, zod protocol in shared, signaling hub split with server-stamped
fromId, pairing and transfer reducers, peer-manager/chunk-utils/use-webrtc split, OsIcon.
Security fixes: PIN bound to approver; first-visit peer id. See git log 7cab8e2..93006f0.
