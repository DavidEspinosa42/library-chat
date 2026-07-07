# 04 — API Contract

> REST API under `/api/v1`. All request/response schemas are Zod (via
> `fastify-type-provider-zod`) and live in `packages/shared` — the OpenAPI spec at `/docs`
> is generated from them. SSE event types are shared with the frontend from the same package.

## Cross-cutting

- **Auth**: JWT in an httpOnly cookie (`SameSite=Lax`, `Secure` in production, 7-day expiry — no refresh tokens, documented limitation). Every route requires it except `/auth/*` and `/healthz` → `401 UNAUTHORIZED` otherwise.
- **Error envelope** (every error, everywhere):

```json
{ "error": { "code": "UNSUPPORTED_FORMAT", "message": "Format '.docx' is not supported. Accepted: pdf, txt, md, epub, azw3." } }
```

- **Listings are unpaginated by design** (demo scale: tens of documents, one active conversation). Cursor pagination is the documented upgrade path.
- **Rate limiting**: `@fastify/rate-limit` keyed by authenticated userId → `429 RATE_LIMITED`.

### Error codes

| Code | HTTP | Where |
|---|---|---|
| `VALIDATION` | 400 | Any schema-invalid body/params |
| `UNAUTHORIZED` | 401 | Missing/invalid session cookie |
| `INVALID_CREDENTIALS` | 401 | Login |
| `NOT_FOUND` | 404 | Unknown/foreign resource id |
| `EMAIL_TAKEN` | 409 | Register |
| `DOCUMENT_NOT_READY` | 409 | Session creation with non-ready docs |
| `PAYLOAD_TOO_LARGE` | 413 | File > `MAX_FILE_MB`, paste > `MAX_PASTE_CHARS`, message > `MAX_CHAT_MESSAGE_CHARS` |
| `UNSUPPORTED_FORMAT` | 415 | Extension/mimetype outside whitelist |
| `RATE_LIMITED` | 429 | Per-user limit hit |
| `INTERNAL` | 500 | Unexpected — no stack traces leak |

## Auth

| Endpoint | Body | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | `{ email, password }` | `201 { user: { id, email } }` + cookie | `EMAIL_TAKEN`, `VALIDATION` |
| `POST /auth/login` | `{ email, password }` | `200 { user }` + cookie | `INVALID_CREDENTIALS` |
| `POST /auth/logout` | — | `204` + cleared cookie | — |

## Documents

### `POST /documents` — submit content (multipart OR JSON)

- **Multipart**: 1..`MAX_FILES_PER_UPLOAD` files. Per-file whitelist (pdf/txt/md/epub/azw3 by extension+mimetype) and size cap. One document row + one ingestion job per file — failures isolated.
- **JSON**: `{ text, title? }` (pasted content, ≤ `MAX_PASTE_CHARS`; title defaults to first line).
- **`202 Accepted`** — ingestion is async:

```json
{ "documents": [ { "id": "…", "title": "The Art of War", "status": "processing", "sourceType": "upload", "format": "txt", "createdAt": "…" } ] }
```

- Errors: `UNSUPPORTED_FORMAT` (415), `PAYLOAD_TOO_LARGE` (413), `VALIDATION` (400 — incl. too many files).

### `GET /documents`

`200 { documents: [ { id, title, filename, sourceType, format, status, error, extractionStatus, createdAt } ] }`

`status`: `processing | ready | failed` (frontend polls this for live badges + ready toast).
`extractionStatus` (derived): `pending | ready | failed` — drives the "analyzing…" card state.

### `GET /documents/:id`

`200 { document, extraction: DocumentCard | null, extractionError: string | null }`
`DocumentCard` = the Zod schema from `02-ai-design.md` (summary, docType, entities, starter questions…). `404 NOT_FOUND` for unknown or other users' ids.

## Chat

Conversation model (see 03): the document selection is **fixed per conversation**
(immutable session snapshot). Past conversations are listed, viewable, and can be
**continued**; "New chat" creates a new session with a new selection.

### `POST /chat/sessions`

Body `{ documentIds: string[] }` — non-empty, all owned by the user and `ready`.
`201 { session: { id, documentIds, createdAt } }`.
Errors: `VALIDATION`, `DOCUMENT_NOT_READY` (409), `NOT_FOUND`.

### `GET /chat/sessions`

`200 { sessions: [ { id, documentIds, documentTitles, createdAt, messageCount, lastMessageAt } ] }`
Ordered by last activity, unpaginated by design. Powers the "Conversations ▾" list
(titles = source names + date).

### `GET /chat/sessions/:id`

`200 { session: { id, documentIds, createdAt }, messages: [ { id, role, content, citations, createdAt } ] }`
Opens a conversation (restore / view / continue). `404 NOT_FOUND` for foreign ids.

### `POST /chat` — the AI interaction endpoint (SSE)

Body `{ sessionId: string, message: string }` (message ≤ `MAX_CHAT_MESSAGE_CHARS`). Runs
the agent over that session's corpus with its full history. Response is
`text/event-stream` (consumed with `fetch` + ReadableStream — SSE-over-POST, EventSource
can't do POST).

Errors before the stream starts use the normal envelope: `NOT_FOUND` (unknown session),
`PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429).

#### SSE events (typed in `packages/shared`)

| event | data | notes |
|---|---|---|
| `token` | `{ delta: string }` | Assistant text, token-by-token |
| `tool_call` | `{ name: "search_chunks", query: string, documentId?: string }` | Drives the "thinking…" UI state |
| `citations` | `{ citations: [{ n, chunkId, documentId, documentTitle, location, snippet }], invalidCitations: number }` | After post-processing; UI renders chips, `invalidCitations > 0` renders a caution note |
| `done` | `{ messageId, usage: { inputTokens, outputTokens }, elapsedMs }` | Terminal event; usage powers cost transparency in the UI |
| `error` | `{ code, message }` | Terminal event on mid-stream failure; UI offers retry |

Keep-alive: comment lines (`: ping`) every 15s while the agent works — relevant to the
ALB idle-timeout discussion in the README; locally nginx proxies with buffering off.

## Misc

- `GET /healthz` (no auth) — `200 { status: "ok", db: "up" }` after a `SELECT 1`; `503 { status: "degraded", db: "down" }` otherwise. Consumed by compose healthchecks and the ALB target group.
- `GET /docs` — Swagger UI generated from the Zod route schemas (`jsonSchemaTransform`).
