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
- AI lives in `src/ai/`: `engine.ts` (`handleCustomerMessage`, channel-agnostic: saves the customer message first, calls the model, splits the reply into bubbles on a `---` line), `model.ts` (`ChatModel` interface, so the model is swappable), `anthropic.ts` (Claude via the SDK; model from `AI_MODEL`, default `claude-opus-5-5`, effort `low`, system prompt cached, server-side refusal fallback), `prompt.ts` (the system prompt: this is where reply quality is tuned). Local test chat: `/playground` (API in `src/app/api/playground/route.ts`, service in `src/server/playground.ts`). Needs `ANTHROPIC_API_KEY` in `.env.local`. Tests: `npm test` (node:test via tsx, no key needed; Claude is faked with a local HTTP server).
- Knowledge / RAG lives in `src/knowledge/`: `chunker.ts`, `embedder.ts` (`Embedder` interface; local `multilingual-e5-small`, 384 dims, model files in `.data/models`), `indexing.ts` (document -> chunks -> vectors, tone examples), `retrieval.ts` (cosine search, per business, same embedding model only). `handleCustomerMessage` takes an `embedder`, searches with the customer's latest message and passes the result to the model as `context`, a second system block after the cached stable prompt. Shop owners manage it at `/playground/knowledge` (`src/server/knowledge.ts`, `src/app/api/knowledge/route.ts`); every write re-indexes. `npm run kb:index` re-embeds everything, `npm run kb:eval` measures search quality (fails below 90% top-3; add real failing questions to `src/knowledge/eval-cases.ts`). `npm run db:reset` ends with `kb:index`. `RUN_MODEL_TESTS=1 npm test` also runs the tests that load the real embedding model. Changing the embedding model with a different vector size needs a migration (`EMBEDDING_DIMENSIONS` in the schema) and a re-index.
- Prices, stock and policies come from the database / tools at reply time, never from model training.
- The AI engine is model-swappable (hosted model first, fine-tuned model compared later on the same evaluation set).

## Next.js

@AGENTS.md
