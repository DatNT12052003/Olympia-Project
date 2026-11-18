# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Olympia Online is an npm-workspaces monorepo. Phase P0 (foundation) of [docs/ke-hoach-trien-khai.md](docs/ke-hoach-trien-khai.md) is done: tooling, dev services, and skeletons for `apps/api`, `apps/web` and `packages/shared` exist; no business features yet.

Docs (all in Vietnamese — read the relevant ones before designing any feature):

- [docs/mo-ta-du-an-olympia.md](docs/mo-ta-du-an-olympia.md) (overview) and [docs/dac-ta-nghiep-vu-olympia.md](docs/dac-ta-nghiep-vu-olympia.md) (business rules with `BR-*` IDs, round rules, state machines, permission matrix). Values marked "mặc định đề xuất" are proposed defaults, not confirmed requirements.
- [docs/cong-nghe-su-dung.md](docs/cong-nghe-su-dung.md) (tech stack), [docs/decision-log.md](docs/decision-log.md) (`DL-*` decisions and their status), [docs/ke-hoach-trien-khai.md](docs/ke-hoach-trien-khai.md) (phases P0–P8).

## Commands

Requires Node.js 24 (`.nvmrc`) and Docker. Run from the repo root unless noted.

```bash
npm install
npm run services:up          # PostgreSQL :5440, Redis :6380, LiveKit :7880, Mailpit :1026/:8026 (localhost)
cp apps/api/.env.example apps/api/.env
npm run db:migrate           # apply TypeORM migrations (db:migrate:revert in apps/api undoes the last one)
npm run dev                  # api :3000 (tsx watch) + web :5173 (Vite, proxies /api and /socket.io to :3000)

npm run lint                 # ESLint (type-aware) over the whole repo
npm run format               # Prettier write; format:check in CI
npm run typecheck            # tsc in every workspace
npm test                     # Jest (api) + Vitest (web)
npm run test:e2e             # Playwright (apps/web/e2e); first run: cd apps/web && npx playwright install chromium
npm run build                # shared → api → web, in that order
```

Single test: `npx jest src/app.test.ts -t "404"` in `apps/api`; `npx vitest run src/app/routes.test.tsx -t "404"` in `apps/web`.

## Code layout and conventions

- **packages/shared** (`@olympia/shared`, ESM): Zod schemas and types shared by api and web — API error body, health report, Socket.IO event contracts. Its `exports` map has a `development` condition pointing at `src/*.ts`; dev tools (tsx `--conditions=development`, Vite, Vitest, api/web `tsconfig` `customConditions`) consume source directly, while `npm run build` / production use `dist`. Jest maps it to source via `moduleNameMapper`. After changing shared, rebuild it before building api/web.
- **apps/api** (CommonJS, `module: nodenext`): `main.ts` wires infrastructure; `app.ts` is a pure `createApp(deps)` factory used by Supertest tests. Business code lives in `src/modules/<module>/` (`*.routes.ts` → `*.controller.ts` → `*.service.ts`); dependencies are passed explicitly (factory functions), not imported singletons. Throw `AppError` subclasses (`src/shared/errors`) for expected errors; `createErrorHandler` turns them into `{ error: { code, message, details? } }` and hides everything else as 500. Env is validated with Zod in `src/config/env.ts` — add new variables there and to `.env.example`. Schema changes only via migrations in `src/infrastructure/database/migrations` (`synchronize` is off); entities go in modules as `*.entity.ts`. Realtime: `createRealtimeServer` takes a `SocketAuthenticator`; until P1 it is `denyAllAuthenticator`. Tests are colocated `*.test.ts`; `tsconfig.jest.json` compiles to CommonJS for Jest.
- **apps/web** (ESM): `src/app` (routes, layout, query client), `src/pages`, `src/features/<feature>` (components + hooks), `src/lib/api-client.ts` (`apiGet` validates responses with shared Zod schemas and throws `ApiError`; `status === 0` means network error). Server data via TanStack Query. Tailwind v4 with theme tokens (`brand-*`, `accent-*`) in `src/index.css`. Tests use `renderApp(path)` from `src/test/render.tsx` and stub `fetch`. UI text is Vietnamese.

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
