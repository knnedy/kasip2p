# HANDOFF

Working log for the staged refactor. Stages 1–3 merged into `main` (e8a1a82).
Current: Stage 4 done; next is the pinned phone send slowdown.

## Stage 4 decisions

- direction "Kasi, the direct wire": every connection is drawn as a wire between two ends;
  cyan (--you) is this device, sodium amber (--them) the other; colour encodes the end and
  the travel direction encodes send/receive; the route is drawn truthfully (local straight,
  internet arc, relay with a middle node); paused = dashed and still
- palette tokens in globals.css (.dark): ink #0b0f14, slate #151b23, line #263040,
  mist #8a97a8, chalk #e8edf2, you #00d9ff, them #ffb547, error #ff6b5e; dark-only for now
- type: Archivo expanded (display, sparingly), Hanken Grotesk (body), JetBrains Mono
  (data), self-hosted by next/font; tabular digits for every number
- home drops the radar and feature cards: devices first; empty state offers a QR to open
  the page on the other device
- motion via emil-design-eng: short ease-out enters, press scale, transform-only progress;
  the wire's moving bursts are the only ambient motion; reduced motion = static fills
- pinned: phone→laptop 133MB slowed 3 → 0.2 MB/s in device test; diagnose after Stage 4

## Stage 4 plan

- [x] 22. style(web): Kasi palette and type tokens, no hard-coded colours
- [x] 23. feat(web): shared size formatting and plain failure messages
- [x] 24. feat(web): wire component for the connection between two devices
- [x] 25. feat(web): redesign home around nearby devices
- [x] 26. feat(web): redesign pairing
- [x] 27. feat(web): redesign the transfer page around the wire
- [x] 28. style(web): motion pass with reduced-motion support
- [x] 29. fix(web): accessibility pass, then merge (before/after screenshots)

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
- two-device checks after steps 3, 7, 15, 18 and 21; merge+push to main at each
- phase A (8-15) fixes and measures the pipeline before features; from step 10 the
  benchmark (`pnpm bench`) runs after every transfer-related step
- data path is direct on the network; speed work targets in-browser stops (sender
  stop-and-go reads, receive copy), measured by the benchmark
- first bench (128MB, same machine, headless Chrome 157): raw data channel 13.6-17 MB/s,
  app 12.2 MB/s (90% of raw), download streamed in the prod build. Raw ceiling barely moves
  with chunk 64/256KB or buffer 2/8MB; 4 channels on one pc ~16 MB/s; multiple pcs in one
  page crashed headless Chrome; across two contexts 1/2/4 pcs gave 13.1/12.4/11.9 MB/s, so
  parallel connections do not raise the ceiling (CPU-bound in Chrome). Read-ahead: app 93% of raw

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
- [x] 10. test(web): add two-browser transfer benchmark
- [x] 11. chore(deps): update to the latest Render/Vercel-compatible versions
- [x] 12. fix(web): recover downloads the browser holds back
- [x] 13. fix(web): drop file copies left in history by older versions
- [x] 14. perf(web): read the file ahead in blocks on the sender
- [x] 15. feat(web): show connection type and live speed (two-device check)
- [x] 16. feat(web): send files through a per-peer queue
- [x] 17. feat(web): pause, resume and cancel transfers
- [x] 18. feat(web): retry failed sends (two-device check)
- [x] 19. feat(shared): add folder paths to file-meta
- [x] 20. feat(web): send folders (fixes stuck folder drop; hidden on phones)
- [x] 21. feat(web): receive folders as a streamed zip download (two-device check)

## Next 3 steps

1. Stage wrap-up: summarize and ask before next stage

## Half-done files

- Stage 4 complete; next: diagnose pinned phone→laptop slowdown (3 → 0.2 MB/s); light theme is a possible follow-up; components/ui/button.tsx is unused; on Render: set ALLOWED_ORIGINS, verify TRUST_PROXY/XFF

## Stage 2 (done, merged)

Reliability + security: register secret and peer-id ownership, origin/size limits, hardened
6-digit PIN, heartbeat, network-scoped discovery, resilient ws-client, ICE config/restart,
backpressure + adaptive chunks, OPFS streaming, resume and channel re-open, object URL cleanup.
Two-device checks passed. See git log 93006f0..988b67c.

## Stage 1 (done, merged)

Hygiene, scripts, CI, vitest, zod protocol in shared, signaling hub split with server-stamped
fromId, pairing and transfer reducers, peer-manager/chunk-utils/use-webrtc split, OsIcon.
Security fixes: PIN bound to approver; first-visit peer id. See git log 7cab8e2..93006f0.
