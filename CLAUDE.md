# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Olympia Online is a **greenfield** monorepo. `apps/api` (backend) and `apps/web` (frontend) exist as empty directories; there is no `package.json`, build, lint or test tooling yet, and the folder is not a git repository. When scaffolding, add the real build/lint/test commands to this file once they exist — do not assume commands that haven't been created.

The product spec is [docs/mo-ta-du-an-olympia.md](docs/mo-ta-du-an-olympia.md) (overview) and [docs/dac-ta-nghiep-vu-olympia.md](docs/dac-ta-nghiep-vu-olympia.md) (detailed business rules with `BR-*` IDs, round rules, state machines, permission matrix, and a decision log for the formerly open questions in section 18). Both are in Vietnamese. Read them before designing any feature. Values marked "mặc định đề xuất" are proposed defaults, not confirmed requirements.

## Intended stack

Defined by the project skills in `.claude/skills/` (also written in Vietnamese — load the relevant one before working in its area):

- **apps/api**: Node.js + Express + TypeScript, PostgreSQL via TypeORM, Redis where justified (cache, rate limit, sessions, queues), Jest + Supertest. Layering: routes → controllers → services/use cases → repositories, with DTO validation at the boundary and centralized error handling.
- **apps/web**: React (function components + hooks) + TypeScript strict + Vite + Tailwind CSS. React Testing Library for components, Playwright for E2E.
- Docker for dev/deploy.

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
