# 03 — Data Model

> PostgreSQL 17 (pgvector image) is the only store. Drizzle ORM with **generated**
> migrations (never `drizzle-kit push`). Vector search is an exact cosine scan — no ANN
> index (see 01). Retention/PII policy at the bottom is the source for the README section.

## Conventions

- **PKs**: `uuid` with `gen_random_uuid()` default (Postgres-native).
- **FKs**: `ON DELETE CASCADE` everywhere — deleting a user or document wipes every derived row (chunks, vectors, extractions, sessions, messages) in one statement. This is the schema-level backbone of the retention story.
- **Timestamps**: `created_at timestamptz DEFAULT now()` on every table; `updated_at` only where rows mutate (`documents`).
- All FK columns carry a btree index.

## Tables

### users
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text UNIQUE NOT NULL | only PII field we hold by design |
| password_hash | text NOT NULL | bcryptjs |
| created_at | timestamptz | |

### documents
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users CASCADE | |
| title | text NOT NULL | filename without extension, or first line of pasted text |
| filename | text NULL | null for pasted text |
| source_type | text NOT NULL | `upload` \| `paste` |
| format | text NULL | `pdf`\|`txt`\|`md`\|`epub`\|`azw3`; null for paste |
| status | text NOT NULL | `processing` → `ready` \| `failed` |
| error | text NULL | human-readable failure reason |
| token_count | int NULL | set after parse |
| created_at / updated_at | timestamptz | |

### chunks
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| document_id | uuid FK→documents CASCADE | |
| user_id | uuid FK→users CASCADE | **denormalized on purpose**: retrieval filters `WHERE user_id = ? AND document_id IN (...)` without a join |
| idx | int NOT NULL | order within document; UNIQUE(document_id, idx) |
| content | text NOT NULL | chunk text (rendered in envelopes & citation snippets) |
| location | text NULL | heading/chapter trail (e.g. "Book V › On obstacles"); null for pdf |
| token_count | int NOT NULL | |
| embedding | vector(1024) NOT NULL | voyage-context-4; exact `cosineDistance` scan |
| created_at | timestamptz | |

### chat_sessions
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users CASCADE | |
| document_ids | jsonb NOT NULL | **immutable snapshot** — the corpus of this conversation, fixed at creation (user decision: selection is locked per conversation; changing sources starts a new session). Kept as jsonb, not a join table: it is an audit snapshot — history stays meaningful even if a document is later deleted (UI marks missing sources) |
| created_at | timestamptz | |

Sessions are never mutated or deleted: the UI lists them (titled by their sources + date),
any of them can be opened and **continued** — its corpus stays fixed. "New chat" simply
creates another session. The conversation list doubles as a visible audit trail (2.1).

### messages
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK→chat_sessions CASCADE | corpus is inherited from the session — no per-message document_ids |
| role | text NOT NULL | `user` \| `assistant` |
| content | text NOT NULL | assistant content stored post-processed (valid `[n]` markers kept, invented ones already stripped) |
| citations | jsonb NULL | assistant only: `[{ n, chunkId, documentId, documentTitle, location, snippet }]` |
| prompt_version | text NULL | assistant only — audit: which prompt produced this |
| model | text NULL | assistant only |
| created_at | timestamptz | |

### extractions
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| document_id | uuid FK→documents CASCADE, UNIQUE | one card per document |
| payload | jsonb NULL | the document card (see 02); null when failed |
| error | text NULL | set when extraction failed |
| prompt_version | text NOT NULL | |
| model | text NOT NULL | |
| created_at | timestamptz | |

Extraction lifecycle from the API consumer's view: no row → "analyzing…";
row with payload → card; row with error → failed state.

## Status machines

- `documents.status`: `processing` → `ready` (chat available) | `failed` (+`error`). Extraction runs after `ready` and never changes document status.
- Conversation: latest `chat_sessions` row = active; creating a new session (with a new `document_ids` snapshot) supersedes it.

## Audit trail (assessment 2.1)

Who asked what, when, over which corpus, with which prompt and model — entirely from
versioned rows, no extra logging system: `messages` (content, role, timestamps,
prompt_version, model, citations) + `chat_sessions.document_ids` (corpus snapshot) +
`extractions` (prompt_version, model per card).

## Retention & PII (assessment 2.1 — README inherits this)

**Stored**: user email + password hash; document text (as chunks) and vectors; chat
messages with citations; extraction cards; prompt version + model per AI output.

**Not stored**: raw LLM request/response logs, provider payloads, or token-level traces
(LangSmith tracing is opt-in via env and lives on the LangSmith side); no analytics events;
no third-party trackers.

**PII stance**: the only PII we require is the account email. Uploaded documents may
contain arbitrary PII — they are treated as user-owned content: stored encrypted at rest
(RDS default in the cloud story), never logged (pino redacts `authorization`, `cookie`,
`set-cookie`, and email fields; document/chat content is never written to logs), and fully
removed by cascade on deletion.

**Retention**: demo policy — data lives until manually deleted (cascades make
user/document deletion complete, vectors included). Production path (documented, not
built): per-table TTL via a scheduled job — e.g. chat messages 90 days, documents until
owner deletion — plus DB backups inheriting the same policy.
