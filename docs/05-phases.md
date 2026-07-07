# 05 — Phases & Progress

> Execution plan with progress tracking. Work strictly in phase order; each phase ends
> verifiable and committed (**one conventional commit per phase on `main`**). Check off
> tasks and Verify items as they complete — this file is the session-to-session state.
> Scope guard: if a task isn't here or in `00-assessment.md`, don't build it.

## Phase D — Documentation-first ✅ (this phase)

- [x] `git init`, `.gitignore`, move seed books to `seed/books/`
- [x] `docs/00-assessment.md` — statement verbatim + traceability + bonus checklist
- [x] `docs/01-architecture.md` — stack, layout, pinned versions, decisions, ingestion
- [x] `docs/02-ai-design.md` — 3 AI modules, templates, citations, injection, evals
- [x] `docs/03-data-model.md` — tables, cascade/retention/PII
- [x] `docs/04-api-contract.md` — endpoints, SSE events, error envelope
- [x] `docs/05-phases.md` — this file
- [x] `docs/06-conventions.md`
- [x] `CLAUDE.md` (pointer + core rules)
- [x] **Commit**: `docs: project design docs and working agreements`

## Phase 0 — Workspace + foundational DB

Install: typescript 5.9.3 · tsx · @types/node · eslint 10 + prettier · fastify 5.10 ·
fastify-type-provider-zod 7 · zod 4.4.3 · @fastify/helmet · @fastify/cors · dotenv ·
drizzle-orm 0.45.2 · drizzle-kit 0.31.10 · postgres 3.4.9 · pino-pretty (dev)

- [x] pnpm workspace (`apps/*`, `packages/*`), root strict tsconfig, `"type":"module"`, `engines: node >=24`, ESLint flat + Prettier
- [x] `packages/shared` skeleton (Zod contracts package, consumed as TS source)
- [x] `apps/api/src/config/env.ts` — Zod-validated, single config entry point; `.env.example` in sync
- [x] `docker-compose.yml` with `db` service (`pgvector/pgvector:pg17`) + init of `app` and `test` databases
- [x] Full Drizzle schema (users, documents, chunks, chat_sessions, messages, extractions per `03`)
- [x] Custom migration `CREATE EXTENSION IF NOT EXISTS vector` + generated migration — inspect the SQL
- [x] Fastify app: helmet, cors, error-envelope handler, `GET /healthz` with DB ping

Verify:
- [x] `pnpm typecheck` green
- [x] `docker compose up db` + `pnpm db:migrate` applies cleanly
- [x] `curl localhost:3000/healthz` → `{ status: "ok", db: "up" }`
- [x] **Commit**: `feat: workspace, config, schema and healthz`

## Phase 1 — Auth + library + multi-format async ingestion

Install: @fastify/jwt · @fastify/cookie · bcryptjs · @fastify/multipart · unpdf ·
@lingo-reader/epub-parser · @lingo-reader/mobi-parser (.azw3/KF8) · p-queue · js-tiktoken · voyageai

- [x] Auth: register/login/logout, bcryptjs, JWT httpOnly cookie, auth guard on `/api/v1/*` (except auth/healthz)
- [x] `POST /documents`: multipart multi-file + JSON paste; whitelist/size/count limits per `01` (error envelope codes per `04`)
- [x] `GET /documents`, `GET /documents/:id`
- [x] Parsers with common `ParsedDocument` interface: pdf, text (txt/md), epub, azw3 — verify lingo-reader API on install
- [x] Chunker: structure-aware, ~400 tokens / 15% overlap, heading trail → `location` (incl. roman-numeral chapter headings)
- [x] Voyage adapter (`embedChunkGroups` / `embedQuery`, contextualized endpoint, `enable_auto_chunking:false`, backoff+jitter) + deterministic fake behind the same factory (`TEST_MODE`)
- [x] Worker: p-queue (`QUEUE_CONCURRENCY=2`), idempotent, parse (magic-byte sniff + 60s timeout) → cap → chunk → embed (section groups ≤ `EMBED_GROUP_MAX_TOKENS`) → batch insert → `ready`/`failed`

Verify:
- [x] curl flow: register → login → upload **all 5 seed books** → poll to `ready` (all 5, ~9s with fake embeddings)
- [x] chunks with `location` present in psql; 401 without cookie; corrupt file → `failed` + message; unsupported format → 415 envelope; paste → ready
- [ ] **Commit**: `feat: auth, documents and multi-format ingestion pipeline`

## Phase 2 — AI core: prompt/ · llm/ · postprocess/ + chat (JSON)

- [ ] `ai/prompt/`: versioned registry (v1), system prompt per `02`, literal templates (exact strings), low-trust envelope, input caps
- [ ] `ai/llm/`: `initChatModel` factory (env model strings), `fakeModel()` test mode, Anthropic `cache_control` decoration, `createAgent` wiring (`recursionLimit`, `maxTokens` from config)
- [ ] `ai/tools/search-chunks.ts`: Zod `{query, documentId?}`, server-enforced corpus filter, top-k exact `cosineDistance`, numbered envelope results
- [ ] `ai/postprocess/citations.ts`: validate `[n]` vs retrieved registry, strip+flag invented markers, build citation list
- [ ] `POST /chat/sessions` (validate owned+ready) + `POST /chat` (JSON response for now): history from DB, persist messages with promptVersion+model

Verify:
- [ ] curl: question about 1 book → valid citations from that book; 2-book comparison → citations from both; no-evidence → exact template
- [ ] smoke vitest with `fakeModel()` (scripted tool_call → answer)
- [ ] **Commit**: `feat: AI core with versioned prompts, agent and citation validation`

## Phase 3 — SSE + conversations + non-blocking extraction

- [ ] `POST /chat` → SSE over `reply.raw` (`token`, `tool_call`, `citations`, `done` with usage+elapsed, `error`; 15s keep-alive comments) via `agent.stream(streamMode:"messages")`
- [ ] Conversation endpoints: `GET /chat/sessions` (list: titles, counts, lastMessageAt) + `GET /chat/sessions/:id` (session + messages); `POST /chat` takes `sessionId`
- [ ] Extraction job (non-blocking, after `ready`): `withStructuredOutput(documentCardSchema)` on capped excerpt → `extractions` row (payload | error); prompt versioned in registry
- [ ] `GET /documents/:id` includes extraction; `GET /documents` includes `extractionStatus`

Verify:
- [ ] `curl -N`: token deltas + tool_call + citations + done(usage) events visible
- [ ] Zod-valid cards for all 5 books, each with 3–5 starter questions
- [ ] Conversation list/get endpoints return continuing-capable history
- [ ] **Commit**: `feat: SSE streaming, conversation history and document cards`

## Phase 4 — Frontend SPA (/login · /library · /chat)

Install: react 19.2 · react-dom · react-router 8.1 · vite 8.1 · @vitejs/plugin-react ·
tailwindcss 4.3 + @tailwindcss/vite · react-markdown 10.1 + remark-gfm 4

- [ ] `/login` (+ register) — loading/error states
- [ ] `/library`: upload form (multi-file, 5 formats) + paste textarea; list with live status badges (polling); selection checkboxes on ready docs + "Start chat with selected (n)"; document card view (title/author/type/summary/themes/entities/starter questions, "analyzing…" and failed states)
- [ ] Upload UX: non-blocking; batch tracking → toast "Your N documents are ready · Start chat with them →" (creates session, navigates to /chat)
- [ ] `/chat` empty state = source picker (ready selectable; processing visible, disabled, live status + ready toast)
- [ ] `/chat` conversation: locked source chips, "Conversations ▾" list (open past conversation → view + continue), "+ New chat"; streaming via fetch+ReadableStream; "thinking…" on tool_call; markdown render with GFM tables; citation chips (document + location + snippet); error state with retry; re-ask button (preloads last question); starter-question chips as empty conversation state; usage footer from `done`
- [ ] Loading/error/empty states everywhere; minimal Tailwind

Verify:
- [ ] Manual browser flow: register → upload book → ready toast → card → starter question → cited answer → 2-book comparison renders a table → past conversation reopened and continued
- [ ] **Commit**: `feat: React SPA with library, chat and conversation history`

## Phase 5 — Tests + evals + seed + API hardening

Install: vitest 4.1 · @fastify/rate-limit · @fastify/swagger + swagger-ui · langsmith ·
@testing-library/react + jsdom (dev)

- [ ] AI-layer tests (colocated): registry/envelope/templates · parsers (tiny fixtures per format + integration with the 5 real books) · tool shaping · postprocess (invented citations, structured parse/reject) · agent flow with `fakeModel()`
- [ ] API-layer tests: `fastify.inject` + fakes + test DB — auth flow, submit → status transitions, sessions + chat contract. No network
- [ ] Web component tests (3–4): citation chip, status badge, SSE client event parser
- [ ] Seed script: demo user + ingest `seed/books/` (all 5)
- [ ] `@fastify/rate-limit` keyed by userId; swagger at `/docs` via `jsonSchemaTransform`
- [ ] `evals/`: golden set per `02` (retrieval-only recall@3 ≥ 0.8, factual per book, cross-book comparatives, no-evidence, out-of-scope, poisoned-book injection, extraction goldens) + judge (Sonnet 5) + `pnpm eval` → console + timestamped JSON in `evals/results/`

Verify:
- [ ] `pnpm test` green (api + web)
- [ ] `pnpm eval` runs against live provider and reports (manual, needs keys)
- [ ] **Commit**: `feat: test suites, eval harness, seed and API hardening`

## Phase 6 — Docker full stack + e2e + CI + GitHub

Install: @playwright/test 1.61

- [ ] API Dockerfile multi-stage (`node:24-alpine`); web build → nginx with `/api` proxy (buffering off for SSE)
- [ ] Full compose (db+api+web) + test profile (`TEST_MODE=1`, keyless)
- [ ] Playwright happy path vs composed test stack: register → upload `The Art of War.txt` → ready → picker → question → cited answer rendered → card visible in /library
- [ ] GitHub repo **library-chat** + push
- [ ] `ci.yml`: lint, typecheck, unit+API+component tests, docker builds, `terraform fmt -check` + `validate` (plan if creds), e2e on compose; badge in README. `evals.yml`: workflow_dispatch

Verify:
- [ ] `docker compose up` brings up the entire system locally
- [ ] e2e green locally and in CI
- [ ] **Commit**: `feat: dockerized stack, e2e and CI pipeline`

## Phase 7 — Terraform + README + costs

- [ ] Terraform: api (ECR, ECS Fargate, ALB, RDS Postgres, Secrets Manager, scoped IAM task role) + web (S3 + CloudFront); `terraform fmt` + `validate` clean (plan in CI if creds) — **never apply**
- [ ] README (English, the deliverable): architecture + mermaid; 3 AI modules named against requirement 1.2; 5-format ingestion + product pillars; injection defenses; cost & rate-limit controls; config-vs-code; data flow/retention/PII (from `03`); evaluation & regression story (`evals/`, JSON diffing); AWS (key location, rotation, bursty scaling: SSE vs ALB idle timeout, provider rate limits as ceiling, queue depth signal); ECS-vs-EKS-vs-serverless; data-collection build-vs-buy (cheerio/Playwright/Apify, SSRF); cost table 1k/10k/100k (re-verify prices that day; Haiku vs Sonnet column; voyage-context-4 + free tier + caching effect); known limitations + upgrade paths; run-locally; requirement→code traceability table (finalized from `00`)
- [ ] LangSmith screenshot of a real trace
- [ ] Final audit: every README claim points at a real file; clean-clone `docker compose up` following only the README

Verify:
- [ ] `terraform validate` green
- [ ] README claim-by-claim audit done
- [ ] Full end-to-end criteria from the plan met (lint/typecheck/test green · demo flow in browser · `pnpm eval` pass on injection & no-evidence · CI badge green)
- [ ] **Commit**: `docs: README, cost analysis and terraform infra`
