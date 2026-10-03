# Alora

Multi-business SaaS: an omnichannel AI customer-support chatbot (WhatsApp, Messenger, Instagram, Telegram, later X) that replies in Bangla / Banglish / English in a natural, human-like way, with a premium mobile-responsive PWA dashboard.

## Start here

- `docs/PLAN.md` is the master plan. It lists the destinations (D0–D16), their status, the "done when" check for each, and the open decisions. Read it first; the "Ekhon kon destination" line at the top says where work stands.
- `docs/WORKLOG.md` is the review log of what has been done and how.

## How to work in this project

- Work on **one destination at a time**. Do not start the next one until the user asks.
- When a destination is finished: mark it `[x]` in `docs/PLAN.md`, update the current-destination line, add an entry at the top of `docs/WORKLOG.md` using the format in that file, and give the user the same review in chat (what was done, how, which files, how to check it themselves).
- **Reply quality comes first.** Stages A and B run entirely on the user's local machine with no login, using a seeded test business and a local test playground. Do not start the dashboard, login, production deploy or any social-media channel work until the user has said the replies are to their liking (the D5 gate in `docs/PLAN.md`).
- Explain in simple terms. The user is a web developer (Next.js / JavaScript) who is new to AI/ML.
- Reply to the user in Banglish (romanized Bangla with English technical terms), matching how they write.
- If an open decision in `docs/PLAN.md` blocks the current destination, ask the user before building.

## Fixed decisions

- Stack: Next.js + TypeScript + Tailwind (PWA), Node backend, PostgreSQL + pgvector, Redis queue, WebSocket. Python only for the fine-tuning experiment (D15).
- Multi-tenant from day one: every tenant-owned table carries `business_id`, even before login exists (login arrives in D8).
- Local database is PGlite (PostgreSQL 18 + pgvector in WASM, folder `.data/pglite`, nothing installed). Commands: `npm run db:reset | db:migrate | db:seed | db:check | db:generate`. PGlite is single-process: stop `npm run dev` before running a `db:*` command. Schema is in `src/db/schema.ts`; change it, then `npm run db:generate`. Scripts are `.mts` (project is CommonJS, scripts use top-level await). The demo business slug is `demo-shop`.
- Prices, stock and policies come from the database / tools at reply time, never from model training.
- The AI engine is model-swappable (hosted model first, fine-tuned model compared later on the same evaluation set).

## Next.js

@AGENTS.md
