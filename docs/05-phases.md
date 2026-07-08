# 05 — Phases & Progress

> Execution plan with progress tracking. Work strictly in phase order; each phase ends
> verifiable and committed (**one conventional commit per phase on `main`**). Check off
> tasks and Verify items as they complete — this file is the session-to-session state.
> Scope guard: if a task isn't here or in `00-assessment.md`, don't build it.

## Phase D — Documentation-first ✅ (this phase)

- [x] `git init`, `.gitignore`, move seed books to `seed/`
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
@lingo-reader/epub-parser · @lingo-reader/mobi-parser (.mobi) · p-queue · js-tiktoken · voyageai

- [x] Auth: register/login/logout, bcryptjs, JWT httpOnly cookie, auth guard on `/api/v1/*` (except auth/healthz)
- [x] `POST /documents`: multipart multi-file + JSON paste; whitelist/size/count limits per `01` (error envelope codes per `04`)
- [x] `GET /documents`, `GET /documents/:id`
- [x] Parsers with common `ParsedDocument` interface: pdf, text (txt/md), epub, mobi — verify lingo-reader API on install
- [x] Chunker: structure-aware, ~400 tokens / 15% overlap, heading trail → `location` (incl. roman-numeral chapter headings)
- [x] Voyage adapter (`embedChunkGroups` / `embedQuery`, contextualized endpoint, `enable_auto_chunking:false`, backoff+jitter) + deterministic fake behind the same factory (`TEST_MODE`)
- [x] Worker: p-queue (`QUEUE_CONCURRENCY=2`), idempotent, parse (magic-byte sniff + 60s timeout) → cap → chunk → embed (section groups ≤ `EMBED_GROUP_MAX_TOKENS`) → batch insert → `ready`/`failed`

Verify:
- [x] curl flow: register → login → upload **all 5 seed books** → poll to `ready` (all 5, ~9s with fake embeddings)
- [x] chunks with `location` present in psql; 401 without cookie; corrupt file → `failed` + message; unsupported format → 415 envelope; paste → ready
- [x] **Commit**: `feat: auth, documents and multi-format ingestion pipeline`

## Phase 2 — AI core: prompt/ · llm/ · postprocess/ + chat (JSON)

- [x] `ai/prompt/`: versioned registry (v1), system prompt per `02`, literal templates (exact strings), low-trust envelope, input caps
- [x] `ai/llm/`: `initChatModel` factory (env model strings), `fakeModel()` test mode, prompt caching via built-in `anthropicPromptCachingMiddleware` (no-op on other providers), `createAgent` wiring (`recursionLimit`, `maxTokens` from config)
- [x] `ai/tools/search-chunks.ts`: Zod `{query, documentId?}`, server-enforced corpus filter, top-k exact `cosineDistance`, numbered envelope results
- [x] `ai/postprocess/citations.ts`: validate `[n]` vs retrieved registry, strip+flag invented markers, build citation list, **enforce literal templates deterministically** (live finding: models append elaboration)
- [x] `POST /chat/sessions` (validate owned+ready) + `POST /chat` (JSON response for now): history from DB, persist messages with promptVersion+model

Verify:
- [x] curl vs LIVE providers: cited answer from the right book/chapter · 2-book comparison → markdown table + 11 valid citations from both · no-evidence & out-of-scope → exact templates (0 invalid citations across all runs). Live fix: `EMBED_GROUP_MAX_TOKENS` 28k (voyage-context-4 window = 32k per group)
- [x] smoke vitest with `fakeModel()` (scripted tool_call → answer) — 7 tests green
- [x] **Commit**: `feat: AI core with versioned prompts, agent and citation validation`

## Phase 3 — SSE + conversations + non-blocking extraction

- [x] `POST /chat` → SSE over `reply.raw` (`token`, `tool_call`, `citations`, `done` with authoritative content+usage+elapsed, `error`; 15s keep-alive; CORS headers set manually on the hijacked reply) via `agent.stream(streamMode:"messages")`
- [x] Conversation endpoints: `GET /chat/sessions` (list: titles, counts, lastMessageAt) + `GET /chat/sessions/:id` (session + messages); `POST /chat` takes `sessionId`
- [x] Extraction job (non-blocking, after `ready`) on capped excerpt → `extractions` row (payload | error); prompt versioned in registry. **Live finding**: `withStructuredOutput` through the universal model fell back to a broken text parser → explicit JSON-only prompt + manual parse + Zod validation at the boundary; LLM-overflowable array maxima are clamped, not rejected; `MAX_TOKENS_EXTRACTION` → 4096
- [x] `GET /documents/:id` includes extraction; `GET /documents` includes `extractionStatus`

Verify:
- [x] `curl -N` vs live model: 21 token deltas + tool_call (model even narrowed by documentId) + citations + done(content+usage) events
- [x] Zod-valid cards for all 5 books (real titles/authors/docType, 3–5 starter questions, themes clamped to 8)
- [x] Conversation list (ordered by last activity, titled by sources) + detail with citation-bearing history
- [x] **Commit**: `feat: SSE streaming, conversation history and document cards`

## Phase 4 — Frontend SPA (/login · /library · /chat)

Install: react 19.2 · react-dom · react-router 8.1 · vite 8.1 · @vitejs/plugin-react ·
tailwindcss 4.3 + @tailwindcss/vite · react-markdown 10.1 + remark-gfm 4

- [x] `/login` (+ register) — loading/error states, autocomplete attrs
- [x] `/library`: upload form (multi-file, 10 formats) + paste form (required title); list with live status badges (polling); row click opens the document card (title/author/type/summary/themes/entities/starter questions, "analyzing…" and failed states); clickable themes/starter questions launch a chat with that question
- [x] Upload UX: non-blocking; batch tracking → toast with "Start chat →" CTA (creates session, navigates to /chat)
- [x] `/chat` empty state = source picker, the single multi-select surface (whole-card toggle, dark-pine selected state; processing visible, disabled, live status + ready toast)
- [x] `/chat` conversation: locked source chips, conversations sidebar (open past conversation → view + continue; "+ New chat" only inside a conversation); streaming via fetch+ReadableStream; "thinking…" on tool_call; markdown render with GFM tables; citation chips (document + location + snippet popover; Escape/click-outside close); error state with retry; re-ask button (preloads last question, refocuses input); starter-question chips as empty conversation state; usage footer from `done`
- [x] Loading/error/empty states everywhere; minimal Tailwind
- [x] Post-review refinement rounds (user UX feedback): reading-room design system (paper/ink/pine/brass tokens, serif display, Tailwind `@theme`); conversations sidebar replacing the dropdown; multi-select moved to the chat picker only (whole-card toggle, dark-pine selected state); clickable themes/starter questions launch a chat with `?ask=` auto-send; required title for pasted text; DRY extraction (useDocuments/useStartChat hooks, PrimaryButton/ErrorAlert/StarterQuestion/DocumentRowContent components); citation renumbering to 1..N in postprocess; docType taxonomy expanded to 12 values + em-dash-free extraction (prompt rule + deterministic sanitizer); upload formats extended to 10 with docx (mammoth), doc (word-extractor), html, mobi, srt, vtt

Verify:
- [x] Browser flow (driven via Playwright vs live providers): login → library with 5 ready books → Meditations card (summary/themes/entities/4 starter questions) → select 2 books → start chat → starter chips from both → comparative question streams a 6-row GFM table with 12 valid citation chips from both books + usage footer → re-ask prefills → history-aware follow-up (1.6s, no re-search) → Conversations dropdown (7, "(deleted)" audit entry) → past conversation reopened with history → paste → processing → ready toast with CTA. Live fix: streaming usage merged by max per message (input tokens arrived as 0)
- [x] `pnpm --filter web build` production build green (128 KB gzip)
- [x] **Commit**: `feat: React SPA with library, chat and conversation history`

## Phase 5 — Tests + evals + seed + API hardening

Install: vitest 4.1 · @fastify/rate-limit · @fastify/swagger + swagger-ui · langsmith ·
@testing-library/react + jsdom (dev)

- [x] AI-layer tests (colocated): templates/prompt envelope/postprocess (existing) · chunker (overlap, sentence fallback, section location) · parsers (tiny fixtures per format + integration with all 6 real seed files) · search tool shaping (corpus clamp, per-turn numbering, envelope — over test DB) · extraction parse/reject/clamp/em-dash · agent flow with `fakeModel()`
- [x] API-layer tests: `fastify.inject` + fakes + test DB — auth flow, submit → status transitions, sessions + chat SSE contract, rate-limit 429 envelope. No network (`test-support/harness.ts`; `vitest.config.ts` + global-setup migrate the test DB)
- [x] Web component tests: citation chip (popover toggle, one-open, Escape), status badge (3 states), SSE client event parser (split frames, ping comments, pre-stream error)
- [x] Seed script (`pnpm seed`): demo user + ingest `seed/` (4 books, then docx, then srt, so the samples sit at the top of the createdAt-desc list); real pipeline, honours TEST_MODE; demo creds in `env.ts` + `.env.example`
- [x] `@fastify/rate-limit` keyed by userId (IP fallback) → `RATE_LIMITED` envelope; swagger at `/docs` via `jsonSchemaTransform`
- [x] `evals/` (workspace package): golden set per `02` (retrieval-only recall@3, factual per book, cross-book comparatives, no-evidence, out-of-scope, poisoned-book injection, extraction goldens) + judge (Sonnet 5, faithfulness over the FULL cited chunks) + `pnpm eval` → console + timestamped JSON in `evals/results/`. Gates on regressions + recall; documented known-limitations (deception chunk-boundary, comparative cross-search citation attribution) are tracked, not gated

Verify:
- [x] `pnpm lint && pnpm typecheck && pnpm test` green (72 tests: 61 api + 11 web)
- [x] `pnpm eval` (live): 20/23 pass, recall@3 0.90 (≥ 0.80), 0 regressions, 3 documented known-limitations; injection + no-evidence + out-of-scope + extraction all pass. **Live findings**: (1) judging faithfulness against the 600-char UI snippet gave false negatives → judge now sees the full cited chunk; (2) a trialled prompt v2 spelling out cross-search citation numbering regressed no-evidence without fixing comparatives → reverted (regression gate working); (3) `fakeModel` streams whole `AIMessage`s not `AIMessageChunk`s → `streamTurn` handles both (TEST_MODE/e2e streaming honesty)
- [ ] **Commit**: `feat: test suites, eval harness, seed and API hardening`

## Phase 6 — Docker full stack + CI + GitHub

- [x] API Dockerfile multi-stage (`node:24-alpine`, tsx runtime, migrates on start); web build → nginx with `/api` proxy (buffering off on `/api/v1/chat` for SSE); root `.dockerignore`
- [x] Full compose (db+api+web) + keyless test override (`docker-compose.test.yml`, `TEST_MODE=1`, `NODE_ENV=test`)
- [x] GitHub repo **library-chat** + push
- [x] `ci.yml`: lint, typecheck, tests (pgvector service + test DB), api+web docker builds, guarded `terraform fmt -check` + `validate` (no-ops until Phase 7); badge in README. `evals.yml`: workflow_dispatch (seed + eval on live provider via secrets)

Verify:
- [x] `docker compose -f docker-compose.yml -f docker-compose.test.yml up` brings up the whole system keyless; full flow verified via nginx (register → paste → ready → session → chat SSE: token/tool_call/citations/done). Live fix: api healthcheck uses `127.0.0.1` (busybox wget resolves `localhost` to IPv6 first)
- [~] CI: workflows are valid (actionlint clean) and GitHub triggers them, but runner provisioning fails at the account level (even a trivial `echo` job fails with no steps/logs) — GitHub's anti-abuse gate on a fresh account. Unblock: verify a payment method / enable Actions runners on the account, then re-run. The exact `lint · typecheck · tests` gate is green locally.
- [x] **Commit**: `feat: dockerized stack and CI pipeline`

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
