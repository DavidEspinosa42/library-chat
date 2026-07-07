# 01 — Architecture

> Stack, repo layout, pinned dependency versions, key decisions, and the ingestion
> pipeline. AI-specific design (prompts, agent, embeddings, citations, evals) lives in
> `02-ai-design.md`. Data model in `03-data-model.md`. API contract in `04-api-contract.md`.
> The final README adds an architecture mermaid diagram (deliberately not maintained here).

## Product in one paragraph

**library-chat** is a multi-source document analyst. Users upload documents of any kind
(.pdf, .txt, .md, .epub, .azw3 — or paste raw text). An async pipeline parses, chunks,
embeds and profiles each document (structured card + clickable starter questions). A chat
agent answers questions grounded in **one or many user-selected sources** via RAG, always
with precise citations (document + section + snippet). Comparative questions across
sources render as markdown tables citing each source. The demo corpus is five public-domain
books — one per supported format — chosen to stress-test long-document ingestion.

## Stack at a glance

| Layer | Choice |
|---|---|
| Runtime | Node 24 LTS · TypeScript 5.9 strict · ESM (`"type":"module"`) · pnpm workspaces |
| API | Fastify 5 + `fastify-type-provider-zod` (Zod 4 validates every route) · `@fastify/{jwt,cookie,multipart,rate-limit,helmet,cors,swagger,swagger-ui}` |
| AI framework | LangChain v1: `createAgent`, `tool()`, `initChatModel` · `@langchain/anthropic` |
| Models | Chat + extraction: `anthropic:claude-haiku-4-5` · Eval judge: Sonnet 5 · Embeddings: `voyage-context-4` @ 1024 dims |
| Storage | PostgreSQL 17 (`pgvector/pgvector:pg17` image) — the **only** store: users, documents, chunks (+vectors), chat sessions, messages, extractions · Drizzle ORM, **generated** migrations |
| Queue | In-process `p-queue`, concurrency from env |
| Frontend | React 19 SPA · Vite 8 · react-router 8 · Tailwind 4 · react-markdown + remark-gfm · custom hooks + `fetch` (no data library) |
| Tests | vitest 4: AI layer (LangChain `fakeModel()`), API layer (`fastify.inject` + test DB), 3–4 React component tests (testing-library) · Playwright e2e against the composed stack in test mode |
| Evals | `evals/` golden set against the live provider · LLM judge · `pnpm eval` → console report + timestamped JSON in `evals/results/` |
| Infra | docker-compose locally (db · api · web, plus a keyless test profile) · Terraform for AWS: api on ECS Fargate (+ECR, ALB, RDS, Secrets Manager, IAM), web on S3+CloudFront — `validate`/`plan` in CI, **never applied** |
| Observability | Fastify's pino logger with redaction · LangSmith tracing opt-in purely via env vars |

## Monorepo layout

```
├─ CLAUDE.md                       # pointer to docs/ + core working rules
├─ docs/                           # 00..06 — these design docs
├─ pnpm-workspace.yaml
├─ docker-compose.yml              # db | db+api+web | test profile
├─ .env.example                    # kept in sync with config/env.ts
├─ seed/books/                     # 5-format demo corpus (public domain)
├─ apps/api/src/
│  ├─ config/env.ts                # single Zod-validated config entry point
│  ├─ db/{schema.ts, client.ts}    # Drizzle; migrations/ generated
│  ├─ modules/{auth, documents, chat}/   # Fastify routes + services
│  ├─ ai/
│  │  ├─ prompt/                   # (1) prompt construction — versioned registry
│  │  ├─ llm/                      # (2) model invocation — initChatModel + createAgent + fakes
│  │  ├─ tools/                    # search_chunks tool
│  │  ├─ postprocess/              # (3) response post-processing — citation validation
│  │  ├─ extraction/               # document card + starter questions
│  │  └─ embeddings/               # voyage-context-4 adapter + test fakes
│  ├─ ingestion/                   # queue, worker, chunker, parsers/{pdf,text,epub,azw3}
│  └─ {app.ts, server.ts}
├─ apps/web/src/{pages/(login,library,chat), components, lib/(api.ts, sse.ts)}
├─ packages/shared/src/            # Zod schemas for API contracts + SSE event types
├─ evals/{cases/, run.ts, judge.ts, seed-docs/, results/}
├─ infra/terraform/
└─ .github/workflows/{ci.yml, evals.yml}
```

## Pinned versions (verified 2026-07-06/07)

Compatibility anchors — do not bump majors without re-checking the notes column.

| Package | Version | Note |
|---|---|---|
| typescript | 5.9.3 | Deliberately **not** 6.x (too fresh for the ecosystem) |
| fastify | 5.10.0 | FTPZ v7 requires `fastify ^5.5.0` |
| fastify-type-provider-zod | 7.0.0 | Requires `zod >=4.1.5`; provides `jsonSchemaTransform` for swagger |
| zod | 4.4.3 | Shared across api, web, shared package |
| @fastify/jwt · cookie · multipart · rate-limit · helmet · cors · swagger · swagger-ui | 10.1 · 11.0 · 10.0 · 11.1 · 13.0 · 11.2 · 9.7 · 6.0 | Fastify 5 line |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | `vector()` column type + `cosineDistance` |
| postgres (porsager) | 3.4.9 | Driver for Drizzle |
| langchain / @langchain/core / @langchain/anthropic | 1.5.2 / 1.2.1 / 1.5.1 | v1 API: `createAgent`, `tool`, `fakeModel` from `"langchain"`; `initChatModel` from `"langchain/chat_models/universal"` |
| voyageai | 0.4.0 | Official TS SDK; we call the contextualized-embeddings endpoint |
| @lingo-reader/epub-parser / mobi-parser | 0.4.6 | mobi-parser handles .azw3 (KF8) — verify exact API on install |
| unpdf | 1.6.2 | PDF text extraction (maintained pdf-parse successor) |
| p-queue | 9.3.1 | ESM-only → whole monorepo is ESM |
| js-tiktoken | 1.0.21 | Token counting for chunker |
| bcryptjs | 3.0.3 | Pure JS — no node-gyp on Windows/Alpine |
| dotenv | 17.4.2 | Loaded only by `config/env.ts` |
| react / react-dom | 19.2.7 | |
| react-router | 8.1.0 | |
| vite / @vitejs/plugin-react | 8.1.3 / 6.0.3 | |
| tailwindcss / @tailwindcss/vite | 4.3.2 | Zero-config Vite plugin |
| react-markdown / remark-gfm | 10.1.0 / 4.0.1 | GFM tables for comparative answers |
| vitest | 4.1.10 | |
| @playwright/test | 1.61.1 | |
| tsx / eslint / pino-pretty | 4.23.0 / 10.6.0 / 13.1.3 | Dev tooling |
| langsmith | 0.7.16 | Tracing activates via `LANGSMITH_*` env only |

## Key decisions

| Decision | Rationale |
|---|---|
| Modular monolith with explicit REST seams | One deployable service with clean module boundaries (`modules/`, `ai/`, `ingestion/`); right size for the scope, seams make future extraction cheap |
| PostgreSQL + pgvector as the only store | Relational integrity for users/sessions/audit rows and vectors in one system; fully local dev via docker |
| **Exact cosine scan — no ANN index** | At demo scale (~4k chunks) sequential scan returns in milliseconds with 100% recall; an ANN index earns its complexity around ~50k+ vectors or high QPS |
| `voyage-context-4` embeddings @ 1024 dims | Contextualized chunk embeddings: each chunk is embedded aware of the whole document — purpose-built for long-document corpora; $0.12/M, 200M free tokens |
| Own chunker (`enable_auto_chunking: false`) | Keeps chapter/heading trail for precise citations, deterministic and unit-testable offline, chunk params live in config and are tunable via the eval set |
| Claude Haiku 4.5 for chat + extraction; Sonnet 5 only as eval judge | Deliberate cost floor for runtime; the judge must be ≥ the judged model to catch subtle faithfulness errors and avoid self-preference bias |
| LangChain v1 `createAgent` with three visible AI modules | The assessment requires visible separation of prompt construction / model invocation / post-processing — `ai/prompt/`, `ai/llm/`, `ai/postprocess/` map 1:1 to it |
| Real provider switching via `initChatModel` | Models are env strings (`anthropic:claude-haiku-4-5`); switching provider = env change + provider package, zero code changes; only `ai/llm/` knows providers exist |
| In-process queue + worker | Background async processing bonus at the right scope; interface-compatible with an external queue |
| `202 Accepted` + async ingestion from day one | Long documents make async real (tens of seconds); the endpoint contract never needs a rewrite |
| Non-blocking extraction | Document is `ready` (chat available) right after embeddings; the structured card arrives asynchronously with an "analyzing…" UI state |
| JWT in httpOnly cookie | Session token unreachable from JS (XSS-hardened); same-origin via nginx proxy keeps CORS trivial |
| `packages/shared` for contracts | Single source of truth for API schemas + SSE event types consumed by both api and web |
| Config vs code | `config/env.ts` is the only config entry point (Zod-validated); zero config literals in code; `.env.example` kept in sync; secrets only via env/Secrets Manager |
| Everything in English | Code, docs, README, UI copy — the reviewer may not read Spanish |

## Ingestion pipeline

`POST /documents` accepts **multiple files** in one multipart request (or one pasted text).
Per file: insert a `documents` row (`status=processing`), enqueue one job, return `202`
with the created document list. Failures are isolated per document.

Worker steps (per job — `QUEUE_CONCURRENCY=2` default):

1. **Parse** by format via a common interface `ParsedDocument { text, sections?: {title, text}[] }` — parsers: `unpdf` (pdf), raw text (txt/md, headings from markdown), `@lingo-reader/epub-parser` (epub, chapters from spine), `@lingo-reader/mobi-parser` (azw3/KF8).
2. **Cap check**: `MAX_DOC_TOKENS` (default 600k) after parse → exceed = `failed` with a clear message, never silent truncation.
3. **Chunk** (own chunker): structure-aware split (headings/paragraphs first), ~`CHUNK_TOKENS=400` with `CHUNK_OVERLAP_PCT=15`, heading trail recorded per chunk as `location`.
4. **Embed**: chunks grouped by section into nested inputs ≤ `EMBED_GROUP_MAX_TOKENS` (~100k, margin under the endpoint's 120k/request cap), `input_type:'document'`, dim 1024; exponential backoff + jitter on 429. Test mode swaps in deterministic fakes.
5. **Insert** chunks in batches (~500 rows/INSERT) inside a transaction.
6. **Mark `ready`** — chat is available now.
7. **Extraction job** (separate, non-blocking): document card + starter questions from a capped excerpt (`EXTRACTION_EXCERPT_TOKENS` ≈ 30k) → `extractions` row (nullable `error` on failure).

Jobs are **idempotent**: a retry deletes the document's previous chunks before re-inserting.

Upload limits (all env-configured, validated at the route): format whitelist by
extension+mimetype (pdf/txt/md/epub/azw3, otherwise `415`), `MAX_FILE_MB=25`,
`MAX_FILES_PER_UPLOAD=10`, `MAX_PASTE_CHARS=500000`.

## Local topology

`docker-compose up` brings up the entire system:

- **db** — `pgvector/pgvector:pg17`, initialized via Drizzle migrations (plus a separate `test` database for the API test suite).
- **api** — multi-stage Dockerfile (`node:24-alpine`), runs migrations then serves `/api/v1`.
- **web** — Vite build served by nginx, proxying `/api` → api container (same-origin: cookies work without CORS gymnastics).
- **Test profile** — `TEST_MODE=1`: LangChain `fakeModel()` + deterministic fake embeddings; the full stack (and Playwright e2e) runs without any API key.

Dev loop outside docker: `pnpm dev` runs api (tsx watch) + web (vite) against the compose db.
