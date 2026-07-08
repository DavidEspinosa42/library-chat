# library-chat — working guide

Multi-source document analyst (Full Stack AI Engineer assessment). Users upload documents
(pdf/docx/doc/txt/md/html/epub/mobi/srt/vtt or pasted text) → async ingestion (parse → chunk → embed → card) →
RAG chat over selected sources with validated citations. Stack: pnpm monorepo · Fastify 5
+ Zod 4 · PostgreSQL/pgvector (Drizzle) · LangChain v1 `createAgent` (Claude Haiku 4.5) ·
voyage-context-4 embeddings · React 19/Vite SPA · docker-compose · Terraform (never applied).

## Docs map — read before touching related code

| Doc | Read when |
|---|---|
| `docs/00-assessment.md` | Scoping anything — requirement source of truth + traceability |
| `docs/01-architecture.md` | Adding packages (pinned versions!), touching layout, ingestion, or infra |
| `docs/02-ai-design.md` | Anything in `ai/` — prompts, agent, citations, embeddings, evals |
| `docs/03-data-model.md` | Schema/migrations, retention/PII questions |
| `docs/04-api-contract.md` | Adding/changing endpoints, SSE events, error codes |
| `docs/05-phases.md` | **Start of every session** — current phase + checkboxes |
| `docs/06-conventions.md` | Style, tests, git, error handling, AI-change workflow |

## Hard rules

1. **Scope guard**: build nothing that isn't in `docs/00` (requirement/bonus) or `docs/05` (agreed task). When in doubt, ask — don't build.
2. Work in phase order (`docs/05-phases.md`); update its checkboxes as you go; **one conventional commit per phase** (English, no scope).
3. Before any phase commit: `pnpm lint && pnpm typecheck && pnpm test` all green.
4. Verify installed package APIs (types/README in `node_modules`) before writing integration code — never from memory. New deps: check `docs/01` pinned table first.
5. Config only via `apps/api/src/config/env.ts` (Zod, fail-fast); update `.env.example` in the same commit. No secrets in the repo, ever.
6. Prompt text changes = new registry version + `pnpm eval` diff (see `docs/06`).
7. Everything in English, kebab-case filenames, Zod at every boundary.
