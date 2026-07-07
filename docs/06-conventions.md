# 06 — Conventions

> Working agreements for every session and every file in this repo. When code and this
> doc disagree, fix one of them in the same commit.

## Language

Everything in **English**: code, comments, docs, README, commit messages, UI copy.

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride` in the root tsconfig; apps/packages extend it. (`exactOptionalPropertyTypes` deliberately off — high friction with libraries.)
- ESM everywhere (`"type": "module"`); Node `>=24` in engines.
- No `any` unless interfacing with an untyped lib — then wrap it once, narrowly typed, at the boundary.
- **Verify the installed package's types/docs before writing integration code** (Fastify plugins, Drizzle, LangChain, lingo-reader) — do not trust memory of API shapes.

## Zod at every boundary

Runtime data never crosses into typed code unvalidated:

- HTTP routes: request/response schemas via `fastify-type-provider-zod` (shared in `packages/shared`).
- Env: `apps/api/src/config/env.ts` is the **only** place reading `process.env` — Zod-validated, fail-fast at boot. Zero config literals anywhere else. `.env.example` updated in the same commit as any env change.
- Agent tools: `tool()` Zod schemas.
- LLM structured output: `withStructuredOutput(zodSchema)`; extraction payloads re-validated on read.

## Files & naming

- **kebab-case** for all file names (`search-chunks.ts`, `document-card.tsx`) — avoids Windows/Linux case-sensitivity surprises in CI/Docker.
- No barrel `index.ts` re-export files; import from the concrete module.
- Modules keep the layout defined in `01-architecture.md`; new files go where the tree says, or the tree gets updated in the same commit.

## Formatting & linting

- Prettier with **defaults** (no config beyond ignore files). ESLint 10 flat config, typescript-eslint recommended; lint errors are build failures.

## Tests

- Colocated `*.test.ts` / `*.test.tsx` next to the unit under test.
- vitest for api/web units; `fastify.inject` for API tests (test DB, `TEST_MODE=1` fakes — no network ever in tests); Playwright only in `e2e/`.
- Test names describe behavior (`"strips citation markers that were never retrieved"`), not implementation.
- AI code is tested through the same factories as production (`fakeModel()`, fake embedder) — no parallel test-only pipelines.

## Git

- Branch: `main` only. **One conventional commit per phase**, no scope: `feat: …`, `fix: …`, `docs: …`, `chore: …`.
- Before every phase commit: `pnpm lint && pnpm typecheck && pnpm test` green, phase checkboxes updated in `05-phases.md`.
- Never commit: `.env`, keys, `evals/results/`, generated artifacts.

## Error handling

- API errors always use the envelope + stable codes from `04-api-contract.md`; add new codes there first.
- No silent catches: a swallowed error must become a `failed` status with a stored message, a logged warning, or a rethrow — never nothing.
- Logs: Fastify's pino with redaction (`authorization`, `cookie`, `set-cookie`, email); never log document content or chat messages.

## AI-specific

- Prompt text changes = new version in the registry, never in-place edits (evals + audit depend on it).
- Literal templates (`02-ai-design.md`) are imported constants — never retyped by hand.
- Model/provider names only ever appear in env config and `ai/llm/` — nowhere else.
- After any prompt or model change: run `pnpm eval` and diff against the previous JSON in `evals/results/` before committing.
