# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Olympia Online is an npm-workspaces monorepo. Phase P0 (foundation) of [docs/ke-hoach-trien-khai.md](docs/ke-hoach-trien-khai.md) is done; P1 (accounts, auth, authorization) is implemented in api (modules `auth`, `users`, `organizations`, `audit`) and web (auth pages, account page, admin pages). P3 (rooms, lobby, base realtime) is implemented in api (modules `rooms`, `realtime/room-realtime`) and web (`/phong-thi` Host pages, `/vao-phong` join, `/phong/:roomId` lobby; `features/rooms` with `useRoomChannel` for Socket.IO and `lib/guest-session.ts` for room-bound guest sessions, DL-028). P2 (question bank) is implemented in api (`media`, `question-bank` modules: questions, question sets, public-set versions and moderation) and web (`/ngan-hang` pages, `/quan-tri/duyet-noi-dung`); public sharing uses snapshot versions (DL-033) and media uploads go straight to object storage via presigned URLs (DL-035). P4 (game engine, scripts, warm-up round, manual mode) is implemented in api (modules `scripts`, `game`, `realtime/match-realtime`) and web (`/kich-ban` script pages, `features/match` Host/Player/Spectator match screens inside `/phong/:roomId`); only the Khởi động round and manual control are playable until P5 (DL-038).

Docs (all in Vietnamese — read the relevant ones before designing any feature):

- [docs/mo-ta-du-an-olympia.md](docs/mo-ta-du-an-olympia.md) (overview) and [docs/dac-ta-nghiep-vu-olympia.md](docs/dac-ta-nghiep-vu-olympia.md) (business rules with `BR-*` IDs, round rules, state machines, permission matrix). Values marked "mặc định đề xuất" are proposed defaults, not confirmed requirements.
- [docs/cong-nghe-su-dung.md](docs/cong-nghe-su-dung.md) (tech stack), [docs/decision-log.md](docs/decision-log.md) (`DL-*` decisions and their status), [docs/ke-hoach-trien-khai.md](docs/ke-hoach-trien-khai.md) (phases P0–P8).
- **UI design (source of truth for every web screen):** the claude.ai Design canvas "Olympia Online – Bộ màn hình" — https://claude.ai/artifact/HKmpC4F1bxyket69iq7Yw8. Boards are named by screen and phase (e.g. `Login`, `Register`, `ForgotPassword`, `UserManagement`, P1…P7); `Main` is the design foundation (Be Vietnam Pro, management screens light on `#F6F7FB` with primary `#2547C9`, game screens on a navy `#0A1A3F` stage with yellow `#F5B82E`, seat colors, 44px touch targets). **Before building or changing any screen, read its board(s) and `Main`, and follow them.** Where a design conflicts with backend rules or data the API does not expose, raise it instead of silently diverging. Screens without a board follow `Main`.

## Commands

Requires Node.js 24 (`.nvmrc`) and Docker. Run from the repo root unless noted.

```bash
npm install
npm run services:up          # PostgreSQL :5440, Redis :6380, LiveKit :7880, Mailpit :1026/:8026, SeaweedFS S3 :8340 (localhost)
cp apps/api/.env.example apps/api/.env
npm run db:migrate           # apply TypeORM migrations (db:migrate:revert in apps/api undoes the last one)
npm run dev                  # api :3000 (tsx watch) + web :5173 (Vite, proxies /api and /socket.io to :3000)

npm run lint                 # ESLint (type-aware) over the whole repo
npm run format               # Prettier write; format:check in CI
npm run typecheck            # tsc in every workspace
npm test                     # Jest (api, needs services:up — uses DB olympia_test) + Vitest (web)
npm run test:e2e             # Playwright (apps/web/e2e); first run: cd apps/web && npx playwright install chromium
npm run build                # shared → api → web, in that order
npm run user:grant-super-admin -w @olympia/api -- <email>   # bootstrap the first Super Admin
```

Single test: `npx jest src/app.test.ts -t "404"` in `apps/api`; `npx vitest run src/app/routes.test.tsx -t "404"` in `apps/web`.

## Code layout and conventions

- **packages/shared** (`@olympia/shared`, ESM): Zod schemas and types shared by api and web — API error body, health report, Socket.IO event contracts. Its `exports` map has a `development` condition pointing at `src/*.ts`; dev tools (tsx `--conditions=development`, Vite, Vitest, api/web `tsconfig` `customConditions`) consume source directly, while `npm run build` / production use `dist`. Jest maps it to source via `moduleNameMapper`. After changing shared, rebuild it before building api/web.
- **apps/api** (CommonJS, `module: nodenext`): `main.ts` wires infrastructure; `app.ts` is a pure `createApp(deps)` factory used by Supertest tests. Business code lives in `src/modules/<module>/` (`*.routes.ts` → `*.controller.ts` → `*.service.ts`); dependencies are passed explicitly (factory functions), not imported singletons. Throw `AppError` subclasses (`src/shared/errors`) for expected errors; `createErrorHandler` turns them into `{ error: { code, message, details? } }` and hides everything else as 500. Env is validated with Zod in `src/config/env.ts` — add new variables there and to `.env.example`. Schema changes only via migrations in `src/infrastructure/database/migrations` (`synchronize` is off), registered in `migrations/index.ts`; entities go in modules as `*.entity.ts` and are registered in `infrastructure/database/entities.ts` (no globs). Give every `@Column` an explicit `type` — tsx/esbuild emits no decorator metadata. With TypeORM 1.x pass `.returning('col')` as a string; an array is treated as property names and silently dropped. Game Engine (`modules/game`, DL-012/DL-013): `engine/match-engine.ts` is a pure reducer `applyInput(state, snapshot, input, now)` → new state + effects; round rules are plugins (`rounds/*.plugin.ts`, registered in `engine/round-registry.ts`) that mutate a cloned state only through `RoundContext` (scores, answers, timers, log). `match-runtime.ts` serializes inputs per match (in-process FIFO + Redis mutex), persists effects and a state checkpoint to PostgreSQL in one transaction, then writes Redis and publishes per-audience views (answers hidden until revealed, BR-RT-01); timers are local `setTimeout`s keyed by timer id, with a lease-holding sweeper as backup. Player/Host match actions go over Socket.IO with ack and a client `actionId` for idempotency. Auth (DL-021): access JWT in `Authorization: Bearer`, rotating refresh token in an HttpOnly cookie scoped to `/api/auth`; every `/api/auth` route requires the `x-olympia-csrf: 1` header. `createAuthenticate` sets `req.principal` (user or guest) by re-reading session + user from DB on each request, so locks/revocations apply immediately; guard routes with `requireUser` / `requirePermission(SystemPermission.X)`. The permission matrix (spec 2.2) lives in `packages/shared/src/permissions.ts` and is shared with web. Realtime uses the same access token (`createTokenSocketAuthenticator`); revoked sessions are disconnected via `disconnectRevokedSessions`. Tests are colocated `*.test.ts`; Jest `globalSetup` creates/migrates `olympia_test` and `src/test/test-context.ts` builds the full app with an in-memory mailer and rate limiter. `tsconfig.jest.json` compiles to CommonJS for Jest.
- **apps/web** (ESM): `src/app` (routes, layout, query client), `src/pages`, `src/features/<feature>` (components + hooks), `src/lib/api-client.ts` (`apiGet`/`apiPost`/... validate responses with shared Zod schemas and throw `ApiError`; `status === 0` means network error; pass `auth: true` to send the access token and retry once after refreshing on 401). `src/lib/auth-session.ts` is the session store: access token only in memory, restored on load via `/auth/refresh` when the `olympia.session` localStorage hint is set; refreshes are single-flight and serialized across tabs with Web Locks (reusing a refresh token revokes the session server-side). Route guards: `RequireAuth` (optionally with a `SystemPermission`) and `RedirectIfAuthenticated`. Shared UI primitives in `src/components` (`Button`, `TextField`/`SelectField`, `Alert`, `Badge`, `Modal`, `icons`) implement the design canvas's `Main` board; theme tokens in `src/index.css` (`canvas`, `brand-*`, `stage-*` navy, `accent-*` yellow, `seat-1..4`) mirror its colors — reuse them instead of new hex values. Auth pages use `AuthLayout` (split navy/form) and admin pages `AdminLayout` (navy sidebar); both render outside `AppLayout`. Server data via TanStack Query. Tailwind v4 with theme tokens (`brand-*`, `accent-*`) in `src/index.css`. Tests use `renderApp(path)` from `src/test/render.tsx` and `mockApi({ 'POST /auth/login': handler })` from `src/test/mock-api.ts` to stub `fetch`. Run Vitest from PowerShell or `apps/web`: under Git Bash at the repo root jest-dom matchers fail to register ("Invalid Chai property"). UI text is Vietnamese.

## Stack

Defined by the project skills in `.claude/skills/` (also written in Vietnamese — load the relevant one before working in its area). See [docs/cong-nghe-su-dung.md](docs/cong-nghe-su-dung.md) for the full list.

- **apps/api**: Node.js 24 + Express 5 + TypeScript, PostgreSQL 17 via TypeORM, Redis (ioredis), Socket.IO with Redis adapter, Zod, Pino, Jest + Supertest.
- **apps/web**: React 19 + TypeScript strict + Vite + Tailwind CSS v4, React Router, TanStack Query. Vitest + React Testing Library, Playwright for E2E.
- Docker Compose for dev services; GitHub Actions CI (`.github/workflows/ci.yml`).

## Domain overview (from the spec)

A multi-room, real-time quiz gameshow platform in the format of a TV knowledge show.

- **Roles**: Super Admin, Manager, Host, Player, Spectator. Spectators can only watch and send reactions — the backend must reject any answer, buzz-in or game-control action from them.
- **Rooms**: created by Hosts; 2–4 Players, public/private, invite code/link, optional spectators. Many Hosts and rooms run concurrently.
- **Rounds**: four round types — Khởi động (warm-up, players take turns), Vượt chướng ngại vật (obstacle/keyword puzzle with hints the Host reveals), Tăng tốc (all players answer at once, speed may affect score), Về đích (finish: each player picks question packs/point values, optional steal/buzz-in). Hosts choose which rounds, their order and their rules, so rounds must be configurable rather than hard-coded as a fixed sequence of four.
- **Game control**: two modes — manual (the Host drives every transition, scores and adjudication) and scripted/automatic (the engine advances rounds/questions, runs timers, auto-grades deterministic answers). In auto mode the Host can still pause or override, and questions that need human judgment move to a "waiting for Host confirmation" state.
- **Question bank**: per-Host banks, categorized by subject/topic/grade/difficulty/round; question types MCQ, true/false, short answer, image, video (audio later); banks can be shared publicly with other Hosts.
- **Real-time**: synced state covers the current round/question, countdown, per-player answer state, correctness, scores/ranking, match state and connection state. WebRTC-style video/voice for 2–4 players; spectators can watch and listen only; the Host controls mic/cam/speaking rights.
- **Results**: match history, per-player stats (correct/wrong/skipped, answer time), replayable past results.

## Architectural constraints

- **Keep Game Engine, Room Management, Question Bank and Realtime Communication as separate modules.** The spec requires this so other gameshow formats can be added later without rebuilding the system. Round logic should plug into the engine, not be baked into rooms or transport.
- **The server is the source of truth for game state and timing.** Concurrent answer submissions must not corrupt scores, so handle ordering and idempotency server-side and never trust client-side timers or scores.
- **Reconnect handling is required.** A player who drops mid-match must be able to rejoin and receive the current state.
- Enforce role- and room-based authorization on the backend for every REST and realtime action.
- The UI must be responsive across desktop, tablet and phone.
