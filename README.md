# Ops RAG Desk

Support/ops desk: ask over runbooks and tickets with **citations**, escalate with **HITL**, and gate quality in **CI**.

Public portfolio extract — not a dump of a private lab. Patterns ported from a Fastify kit graduate; this repo stays thin and domain-shouting.

**One-liner:** Hybrid RAG + agent turns for ops/support workflows you can inspect, evaluate, and trust.

**Stack:** Fastify · [`@fastify/react`](https://vite.fastify.dev/react/) · Drizzle · Better Auth · pg-boss · Postgres 18 + pgvector · Redis · RustFS · Inbucket

Kit seams (MVC, queue, auth): see [AGENTS.md](./AGENTS.md) and [docs/architecture.md](docs/architecture.md).

## Demo loop

**Shipped:**

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
3. Sign in, open `/admin` (JSON `{ redirectTo }` → `/admin/users`)

Stop compose services: `npm run db:down`

## Database

- Compose uses **`pgvector/pgvector:pg18`** — Postgres 18 with [pgvector](https://github.com/pgvector/pgvector).
- Schema changes: edit `app/models/schema.ts` → `npm run db:generate` → `npm run db:migrate`.
- Default URL: `postgres://ops_rag_desk:ops_rag_desk@localhost:5432/ops_rag_desk`

## Not this repo

- Private continuous-explore lab stays separate — do not merge lab sprawl here.
- Zendesk/Intercom product parity is out of scope; one authenticated ops desk + eval proof is the bar.
