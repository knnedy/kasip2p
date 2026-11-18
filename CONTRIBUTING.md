# Contributing to KasiP2P

Thanks for helping. This guide covers setup, the rules the codebase follows, and how to get a change merged.

## Setup

You need Node.js 24 or newer and pnpm 12 (`corepack enable`).

```bash
pnpm install                                   # from the repo root only: one lockfile
cp apps/web/.env.example apps/web/.env.local   # set ALLOWED_DEV_ORIGINS to your LAN IP
pnpm dev                                       # web on :3000, signaling on :3001
```

Test with two real devices whenever you can, such as a laptop and a phone on the same Wi-Fi. Many transfer problems only show up there.

## How the code is organised

```
packages/shared   message schemas and types (zod)
apps/signaling    discovery, pairing, handshake relay
apps/web          the app: UI, transfer engine, WebRTC, storage
```

Work **bottom-up**. A change that crosses packages starts in `packages/shared`, then `apps/signaling`, then `apps/web`.

## Ground rules

- **File data never goes through the server.** The signaling server relays discovery, pairing and connection setup only. Keep it that way.
- **Every message has a schema in `packages/shared`** and is validated at runtime when it's received. Add a test for each new message type, covering one valid and one invalid case.
- **Received files go to Downloads**, streamed where the browser allows. Don't keep large copies in IndexedDB or OPFS beyond a transfer.
- **Ask before big structural changes**, such as a new package, a new dependency with a large footprint, or a change to the transfer protocol. Open an issue first.

## Writing code

- **TypeScript throughout**, strict mode. Prefer small modules with a clear job, and pure functions where possible: most of `lib/` is tested without a browser.
- **Test first** for logic: write a failing test, make it pass, then tidy up. Tests use Vitest and sit next to the code (`*.test.ts`).
- **Comments** are two lines at most and explain *why*, not *what*.
- **UI:**
  - Colours, fonts and motion come from the tokens in `apps/web/src/app/globals.css`, so don't hard-code colours.
  - The theme convention is `--you` (cyan) for this device and `--them` (amber) for the other.
  - Respect `prefers-reduced-motion`.
  - Keep text contrast at WCAG AA in both themes and touch targets at least 44px.
  - Every control needs an accessible name.

## Before you open a pull request

Run all of these from the root. CI runs the first four.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If you touched anything on the transfer path (`lib/webrtc`, `lib/transfer`, `use-webrtc`), also run the benchmark. It drives the real app in two Chrome windows and checks that the received file is byte-identical:

```bash
pnpm bench                                    # 256 MB file
pnpm bench -- --size-mb 64 --folder           # a nested folder, received as a zip
pnpm bench -- --phone --cpu 6                 # phone-sized sender with a slow CPU
pnpm bench -- --link-kbps 400 --pause sender  # slow Wi-Fi, pause and resume mid-send
```

It needs Chrome installed and ports 3001 and 3300 free, so stop `pnpm dev` first. Include the before and after numbers in your PR if speed could change.

## Commits and pull requests

- **One change per commit**, written as a [Conventional Commit](https://www.conventionalcommits.org/), for example:
  - `feat(web): pause a transfer from either side`
  - `fix(signaling): reject expired pairing codes`
  - `docs: explain the bench options`
- **The scope** is `web`, `signaling`, `shared`, or none for repo-wide changes.
- **Stage files deliberately.** Don't sweep in unrelated changes with `git add -A`.
- **Keep PRs focused.** Describe what changed, why, and how you tested it (devices and browsers too, for UI or transfer changes).
- **Never commit secrets.** `NEXT_PUBLIC_*` variables ship to every browser, so TURN credentials there must be short-lived.

## Reporting bugs

Open an issue with:

- the two devices, operating systems and browsers;
- what you did, what you expected and what happened;
- for transfer problems: the file size, the speed shown, and the connection label at the top of the transfer page (for example "Direct · your network · 4 ms").
