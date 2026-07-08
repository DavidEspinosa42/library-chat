# library-chat

[![CI](https://github.com/DavidEspinosa42/library-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/DavidEspinosa42/library-chat/actions/workflows/ci.yml)

Multi-source document analyst: upload documents (pdf, docx, doc, txt, md, html,
epub, mobi, srt, vtt — or paste text), which are parsed, chunked, embedded and
profiled asynchronously, then chat over one or many selected sources via RAG with
validated citations. Stack: pnpm monorepo · Fastify 5 + Zod 4 ·
PostgreSQL/pgvector (Drizzle) · LangChain v1 `createAgent` (Claude Haiku 4.5) ·
voyage-context-4 embeddings · React 19 / Vite SPA.

> The full architecture, cost analysis and design write-up land in Phase 7. Until
> then, the design docs under [`docs/`](docs/) are the source of truth.

## Run it locally

The whole system runs offline with no API keys via the keyless test stack
(`TEST_MODE=1` swaps every AI call for a deterministic fake):

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build
# → web on http://localhost:8080, API on http://localhost:3000
```

For the real stack (live models), copy `.env.example` to `.env`, fill in
`ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`, then:

```bash
docker compose up --build
```

## Develop

```bash
pnpm install
docker compose up db            # Postgres + pgvector
pnpm db:migrate
pnpm dev                        # API (tsx watch) + web (vite)
pnpm lint && pnpm typecheck && pnpm test
pnpm seed                       # demo user + seed corpus (needs keys, or TEST_MODE=1)
pnpm eval                       # golden-set evals vs the live provider (needs keys)
```

## Docs

`docs/00`–`docs/06`: assessment traceability, architecture, AI design, data model,
API contract, phase plan, and conventions. OpenAPI is served at `/docs` when the
API is running.
