# Ops RAG Desk

Support/ops desk: ask over runbooks and tickets with **citations**, escalate with **HITL**, and gate quality in **CI**.

**One-liner:** Hybrid RAG + inspectable agent turns for ops/support workflows you can evaluate and trust.

**Stack:** Fastify · React · Drizzle · Better Auth · pg-boss · Postgres 18 + pgvector · Redis · RustFS · Inbucket

## App tree

Domain seams live under `app/`. Presentation under `client/`. Corpus + eval fixtures under `fixtures/`.

```text
ops-rag-desk/
├── app/
│   ├── controllers/
│   │   ├── desk/                 # /desk API + page loader
│   │   │   ├── agent-handlers.ts # accept run, inspect, answer ask
│   │   │   ├── handlers.ts       # Quick RAG ask
│   │   │   └── …
│   │   └── documents/            # upload intake
│   ├── models/
│   │   ├── desk-thread.ts        # threads + messages
│   │   ├── agent-run.ts          # runs + step trace
│   │   ├── agent-ask.ts          # ask_user HITL rows
│   │   ├── document.ts
│   │   └── schema.ts
│   ├── services/
│   │   ├── desk-agent/
│   │   │   ├── run.ts            # accept → enqueue → execute
│   │   │   ├── tools.ts          # search_ops_docs, list_ops_docs, ask_user
│   │   │   └── hitl.ts           # detect awaiting_human from tool results
│   │   ├── retrieval/            # chunk / embed / retrieve / citations
│   │   ├── parse-document.ts
│   │   ├── index-document.ts
│   │   └── eval/                 # offline gate (no OpenAI)
│   └── queue/
│       └── handlers.ts           # desk_agent_turn, parse_document, index_document
├── client/
│   ├── pages/desk/               # /desk UI (Quick RAG + Agent inspect)
│   └── components/screen/desk/
├── cmd/
│   ├── web/                      # HTTP process
│   └── worker/                   # job process (agent turns + indexing)
├── db/migrate/                   # SQL migrations (incl. chunks, runs, asks)
└── fixtures/
    ├── ops-corpus/               # demo runbooks / tickets
    └── eval/rag-cases.json       # CI eval cases
```

## How an agent run works

**Accept ≠ execute.** HTTP only accepts the turn (persist + queue). The worker runs the model loop and writes an inspectable step trace.

```text
User message (/desk Agent)
        │
        ▼
 acceptDeskAgentTurn
   · create/continue desk_thread
   · if pending ask → answer it
   · append user message
   · create agent_run status=queued
        │
        ▼
 enqueue desk_agent_turn { runId }
        │
        ▼
 Worker: executeDeskAgentTurn
   · claim queued → running
   · generateText + tools (max 6 steps)
   · append agent_run_steps: tool_call / tool_result / finish|error
        │
        ├─ ask_user fired? ──► status=awaiting_human (park)
        │                         human reply → new accept + new run
        │
        ├─ normal finish ───► status=done + assistant message
        │
        └─ error ───────────► status=failed
```

### Statuses

| Status | Meaning |
|--------|---------|
| `queued` | Accepted; waiting for worker |
| `running` | Model + tools in flight |
| `awaiting_human` | `ask_user` parked the turn — human must reply |
| `done` | Final assistant text written to the thread |
| `failed` | Error recorded on the run |

### Tools

| Tool | Role |
|------|------|
| `search_ops_docs` | Retrieve grounded excerpts + citation metadata from the user’s corpus |
| `list_ops_docs` | List uploaded documents |
| `ask_user` | Escalate / clarify — creates an ask row and parks the run |

Inspect any run via `GET /api/desk/runs/:id` (steps, output, pending ask) or the Agent panel on `/desk`.

## Demo loop

1. Upload fixtures from `fixtures/ops-corpus/` on the dashboard
2. Worker: `parse_document` → `index_document`
3. `/desk` → **Quick RAG** ask with citations
4. `/desk` → **Agent** send → worker `desk_agent_turn` → step inspect; `ask_user` parks for HITL reply

**Eval gate (CI, no OpenAI):** `npm run test:eval` — RAG fixtures in `fixtures/eval/rag-cases.json` + desk-agent cases (happy search / ask park / refuse).

## Setup

```bash
cp .env.example .env
npm install

npm run db:up          # pulls pgvector/pgvector:pg18 and starts it
npm run redis:up       # local Redis (optional; also started by npm run dev)
npm run db:migrate

npm run dev:all        # compose (postgres + redis + rustfs + inbucket) + web + worker → http://localhost:3000
# npm run worker       # other terminal, if not using dev:all
```

Magic-link mail: with `MAIL_TRANSPORT=smtp` (default in `.env.example`), open **http://localhost:8025** (Inbucket) after requesting a link.

Promote an Admin after migrate:

1. Sign up at `/login`
2. `npm run admin:promote -- you@example.com`
3. Sign in, open `/admin`

Stop compose services: `npm run db:down`

## Database

- Compose uses **`pgvector/pgvector:pg18`** — Postgres 18 with [pgvector](https://github.com/pgvector/pgvector).
- Schema changes: edit `app/models/schema.ts` → `npm run db:generate` → `npm run db:migrate`.
- Default URL: `postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk`

## Not this repo

- Private continuous-explore lab stays separate — do not merge lab sprawl here.
- Zendesk/Intercom product parity is out of scope; one authenticated ops desk + eval proof is the bar.
