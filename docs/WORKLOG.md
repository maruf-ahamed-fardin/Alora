# Alora — Worklog (review log)

Protita destination shesh hole ekhane ekta entry jog hobe. Notun entry shobar upore.

Entry er format:

```
## D<number> — <nam> (YYYY-MM-DD)
**Ki kora holo:**      shadharon bhashay, ki toiri holo
**Kivabe kora holo:**  kon approach, keno
**Kon file:**          gurutto purno file / folder
**Kivabe check korben:** nije cholaye dekhar step
**Ja baki / janar moto:** shomossha, shimaboddhota, porer destination er jonno note
```

---

## D1 — Database, login chara (2026-10-03)

**Ki kora holo:** Local database toiri holo: 7 ta table, migration, ekta demo business (seed), ar ekta health check. Shob kichu ek command e cholе: `npm run db:reset`. Login nai (D8 e).

**Kivabe kora holo:**
- **PGlite, Docker na:** apnar computer e na PostgreSQL na Docker chilo. System e boro software install na kore PGlite use kora holo: eta asholei PostgreSQL 18 (WASM e), Node er vitore cholе, data thake `.data/pglite` folder e. pgvector (D3 er RAG er jonno) o kaj kore, test kora. Schema standard Postgres, tai D9 e hosted PostgreSQL e shorashori jabe, shudhu `src/db/client.ts` e driver bodlate hobe.
- **Drizzle ORM:** schema TypeScript e lekha (`src/db/schema.ts`), `drizzle-kit generate` SQL migration banay (`drizzle/0000_init.sql`).
- **Tenant safety database er level e:** protita table e `business_id`. Child table (conversation, message, customer) parent ke `(business_id, id)` composite foreign key diye dhore, tai bhul kore onno business er customer / conversation e jora lagano database nijei reject kore, code e bhul hole-o.
- **Webhook retry safe:** `messages` e `(conversation_id, external_id)` unique, tai Meta / Telegram eki message duibar pathale duibar save hobe na.
- Script gulo `.mts`, karon project CommonJS ar script e top-level `await` lage.

**Table gulo:** `businesses` (nam, tone_notes), `channels` (playground / telegram / messenger / instagram / whatsapp / x / web), `customers`, `conversations` (status open/handoff/closed, ai_enabled), `messages` (sender: customer/ai/agent/system), `products` (dam numeric, stock, attributes jsonb e size-wise stock), `knowledge_documents` (FAQ, policy, delivery, payment, about).

**Demo business `demo-shop`:** 5 product (Black T-shirt ৳1300, White T-shirt ৳1250 jar L size shesh, Red Polo ৳1650, Denim Jeans ৳2100, Navy Hoodie ৳2400 jar stock 0), 5 knowledge document (delivery: Dhaka ৳60 / baire ৳120, payment: COD + bKash / Nagad, return: 7 din, size guide, business hours), ekta playground channel, ekta "Local Tester" customer. Kichu product ichchhe kore out of stock rakha, jate D2–D4 e dekhi AI stock banay kina.

**Kon file:**
- `src/db/schema.ts` — shob table
- `src/db/client.ts` — database connection
- `drizzle/0000_init.sql` — generated migration
- `scripts/db-migrate.mts`, `db-seed.mts`, `db-reset.mts`, `db-check.mts`
- `drizzle.config.ts`, `README.md`, `.env.example`

**Kivabe check korben:**
1. `npm run db:reset` (naya kore database toiri + seed)
2. `npm run db:check` — 12 ta PASS dekhabe, "All checks passed." Er moddhe tenant isolation test o ache (onno business er sathe jorar chesta fail hoy).
3. Dev server bondho rekhe cholan (PGlite ekbar ek process).

**Ja baki / janar moto:**
- **Ekbar ek process:** `npm run dev` cholar shomoy `db:*` command chalaben na. Production e (real Postgres) ei shimabodhota thakbe na.
- **Per-size stock:** ekhon `products.attributes.sizes` e rakha (jemon `{M:5, L:4}`). D4 te dekhbo alada `product_variants` table lagbe kina.
- **Embedding table nai:** D3 te, embedding model (Open decision 3) thik hole.
- **Credentials:** `channels.credentials` e token D10 theke ashbe; ager aage encrypt korar babostha lagbe.
- **npm audit** warning ekhono ache (D0 theke), production er age dekhbo.
- D2 shuru korar age **Open decision 1** lagbe: AI model hosted paid API (recommended) naki free / self-hosted? Hosted hole API key lagbe.

---

## D0 — Project setup (2026-10-03)

**Ki kora holo:** Next.js (16.3.8) + React 19 + TypeScript + Tailwind v4 project toiri holo. Home page e shudhu "Alora" ar tagline dekhay. Lint ar production build pass kore.

**Kivabe kora holo:** `create-next-app` diye scaffold kora. Folder er nam `Alora` (boro hater A), kintu npm package nam e capital letter cholе na, tai ekta lowercase `alora` temp folder e scaffold kore file gulo `C:\my-github\Alora` e copy kora holo, tarpor `npm install`. Existing `CLAUDE.md` overwrite na kore tar sheshe `@AGENTS.md` jog kora holo. `src/` directory, App Router, `@/*` import alias.

**Kon file:**
- `src/app/page.tsx`, `src/app/layout.tsx` — home page ar metadata (title "Alora")
- `AGENTS.md` — Next.js scaffold er file: ei version e API alada, kode lekhar age `node_modules/next/dist/docs/` porte bole
- `.env.example` — environment variable er template (ekhon khali); `.gitignore` e `.env*` ignored kintu `.env.example` commit hobe
- `README.md` — run korar niyom
- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`

**Kivabe check korben:**
1. `cd C:\my-github\Alora`
2. `npm run dev`
3. Browser e http://localhost:3000 kholun: "Alora" ar tagline dekha jabe. Phone width e chhoto korleo thik thakbe.

**Ja baki / janar moto:**
- Kichu commit kora hoy nai. Git repo te age theke ekta "first commit" ache; notun file gulo uncommitted.
- `npm install` e `npm audit` kichu warning dekhiyeche; ekhon fix kora hoy nai (`--force` bhenge dite pare). Production er age dekhbo.
- Folder e already ekta `README.md` chilo (shudhu "# Alora"), ota replace kora holo.
- Meta developer account er apply ekhon lagbe na, D6 e bolbo.
- D1 er jonno local PostgreSQL lagbe. Apnar computer e install ache kina ba Docker ache kina bolle D1 shuru korar age shei decision niye nibo.

---

## Planning (2026-10-03)

**Ki kora holo:** Pura project er master plan toiri kora holo ar 17 ta choto destination (D0–D16) e bhag kora holo. Kono code lekha hoy nai.

**Plan bodol (eki din):** User er kothay login Stage A theke Stage D te shorano holo (D8). Stage A ar B ekhon pura local, login chara. Notun D5 "Reply tuning + user approval" gate jog holo: user "reply mon moto hoyeche" na bolle dashboard, login, production ba social media connect shuru hobe na. Production deploy alada destination holo (D9).

**Kivabe kora holo:** User er ChatGPT conversation pore requirement ber kora holo: multi-business SaaS, Bangla + Banglish + English, WhatsApp / Messenger / Instagram / Telegram, human-like reply, premium PWA dashboard. Destination gula emon bhabe shajano je protitar sheshe kichu ekta chokhe dekha jay ar check kora jay.

**Kon file:**
- `docs/PLAN.md` — master plan, destination list, status, open decisions
- `docs/WORKLOG.md` — ei file
- `CLAUDE.md` — porer session e Claude jate project ar kaj er niyom bujhe

**Kivabe check korben:** `docs/PLAN.md` khule destination gula porun.

**Ja baki / janar moto:** 3 ta open decision ache (model, hosting, embedding); prothom ta D2 er age lagbe. Meta developer account er apply D6 er shomoy korle hobe, karon channel connect D5 gate er pore.
