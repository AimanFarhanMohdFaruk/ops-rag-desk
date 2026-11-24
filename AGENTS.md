# Agent guide

Ops RAG Desk — Rails-shaped Fastify + `@fastify/react`. Read these before growing features or UI.

## Tracker

Effort tracker (jobs → products → briefs): [ai-engineer-project-spree.canvas.tsx](/Users/aimanfarhan/.cursor/projects/Users-aimanfarhan-Code-home/canvases/ai-engineer-project-spree.canvas.tsx).

Domain glossary: [CONTEXT.md](./CONTEXT.md). Reference lab (do not ship): `/Users/aimanfarhan/Code/personal/experiments` Support Copilot + Docs Desk seams.

## Always

- **Fat models**, thin controllers; **services** only for cross-model / model+queue / policy-heavy intake.
- Models never import `controllers/`, `queue`, or `client/` (enqueue from controllers/services only).
- **API controllers** — `app/controllers/<resource>/{index,handlers,dto}.ts` (even one route). Scan `index.ts` (`app.get/post` + `requireSession` when private). Exception: `auth.ts`.
- **Page loaders** — `app/controllers/<area>/loaders.ts` (`load*Page`: gate + query + `*Dto`). Page `getData` does **one** dynamic import of that loader — no multi-import `@app` / hand-maps in the page. Areas today: `admin`, `dashboard`, `desk`, `home`, `login`.
- **One JSON seam** — `dto.ts` shapes HTTP; `/api` handlers **and** page loaders call `*Dto`. DTO types via `import type` through `@/lib/api`; page data types via `import type` from the area loader.
- **Domain errors** — throw `AppError` subclasses from `app/errors.ts` (and `UploadDocumentError`); `composeWebApp` `setErrorHandler` maps them to JSON. Handlers do not try/catch for status.
- **Auth** — `requireSession` / `sessionUser` for private `/api`; `gatePage` (page-gate) + `isAdmin` for pages — never `role === 'admin'`. Page loaders return JSON only (`{ redirectTo }` + client `pageRedirect` / `<Navigate>`); never `reply.redirect` in `getData` / `gatePage` (breaks `/-/data/*`).
- **Upload policy** — limits / accept / typed errors live in the service; boot + UI + handlers import them.
- **Queue** — stupid bus in `app/queue/`: `handlers` registry, typed `enqueue(name, args)`, `registerWorkers`. Delivery via adapter (pg-boss prod; `createInlineAdapter` + `setQueueAdapter` in tests). Do **not** require a domain row to enqueue; do **not** add `parse:'sync'` on Document intake.
- `client/` is presentation + route modules only — no domain rules, no client-side business filter/sort.
- Tests: **`node:test` + `node:assert`**, Testcontainers DB via `TEST_DATABASE_URL` (never truncate from ambient `.env` `DATABASE_URL`), real Better Auth `testUtils` sessions — see testing patterns.

## Docs

| When | Read |
|------|------|
| How the kit is built (processes, seams, request paths) | [docs/architecture.md](docs/architecture.md) |
| Growing a feature (schema, domain, HTTP, jobs) | [docs/agents/grow-a-feature.md](docs/agents/grow-a-feature.md) |
| Frontend / pages / design-system work | [docs/agents/frontend-patterns.md](docs/agents/frontend-patterns.md) |
| Writing or extending tests (lanes, harness, must-nots) | [docs/agents/testing-patterns.md](docs/agents/testing-patterns.md) |
| Test strategy (why / hard rules) | [docs/testing.md](docs/testing.md) |

Stack decision and kit approach: [README.md](./README.md).
