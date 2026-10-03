# Alora

Intelligent conversations, beautifully connected.

Plan and progress: see `docs/PLAN.md` and `docs/WORKLOG.md`.

## Run locally

```bash
npm install
npm run db:reset   # create the local database and load the demo shop
npm run dev
```

Open http://localhost:3000

## AI model and test chat

1. Get an API key at https://console.anthropic.com.
2. Create `.env.local` (copy `.env.example`) and set `ANTHROPIC_API_KEY=...`.
3. `npm run dev`, then open http://localhost:3000/playground and chat as a customer.

`npm test` runs the tests; they need no key.

## Database (local)

Local development uses PGlite (PostgreSQL 18 in WASM, pgvector included). Nothing to install; data lives in `.data/pglite` and is not committed.

| Command | What it does |
|---|---|
| `npm run db:reset` | Delete the local database, then migrate and seed from scratch |
| `npm run db:migrate` | Apply migrations from `drizzle/` |
| `npm run db:seed` | Reload the demo shop (safe to re-run) |
| `npm run db:check` | Health check: tables, pgvector, seed data, tenant isolation |
| `npm run db:generate` | After editing `src/db/schema.ts`, generate a new migration |

PGlite allows one process at a time: stop `npm run dev` before running a `db:*` command.

## Environment

Copy `.env.example` to `.env.local` and fill in the values. Never commit `.env.local`.
