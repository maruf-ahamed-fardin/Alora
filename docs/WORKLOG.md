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

## D3 — Knowledge + tone (2026-10-03) — code ready, live check baki

**Ki kora holo:** AI ekhon shop er nijer tothyo (delivery, payment, return, size guide, business hours) theke uttor dey, ar shop er team er purono reply dekhe shei tone e kotha bole. Shop owner browser e `/playground/knowledge` e tothyo add / edit / delete korte pare, ar change ta porer message e-i kaj kore. D3 8 ta alada PR-e bhag kora, prottek ta ekta nijosso dhap.

**Ja verify kora holo ar ja holo na:**
- Pass: 61 ta test, `tsc`, lint, `next build`, `db:check`, `kb:eval`.
- **Ashol embedding model diye** search quality maapa: `npm run kb:eval`, 29 ta proshno (Bangla, Banglish, English):

| Bhasha | Thik document sobar upore | Top-3 te thik document |
|---|---|---|
| Bangla | 8/9 (89%) | 9/9 (100%) |
| Banglish | 11/14 (79%) | 13/14 (93%) |
| English | 4/6 (67%) | 6/6 (100%) |
| **Sob** | **23/29 (79%)** | **28/29 (97%)** |

  Model top-3 chunk dekhe, tai top-3 ta ashol maap; 90% er niche gele `kb:eval` fail kore. Ekta miss: `kotodin e pabo product ta`. Delivery related proshno gulo prai top-1 e Payment/Return er pichone porche, kintu top-3 e thake.
- Pass: dev server + ashol embedder + **fake Claude** diye end-to-end: Banglish proshno → 3 chunk + 3 tone example context e jay (prompt-er cache kora ongsho theke alada block e). Notun document add korar por-i chat e context e ashe.
- **Holo na:** Claude er ashol uttor. API key nai. Tai "model ta context ta thikmoto bebohar kore ki na", "tone ta manusher moto lage ki na" amra jani na.

**Kivabe kora holo:**
- **Embedding:** `Xenova/multilingual-e5-small` (Hugging Face transformers.js), nijer machine e. Prothom bar ~25 sec e load hoy ar ~120 MB download hoy `.data/models` e. `Embedder` interface er pichone.
- **Chunk:** document ke `।` / `.` / `?` te bhag kore ≤600 char er tukro; prottek tukro r age document er title (jate "৬০ টাকা" jane eta delivery niye).
- **Tone example:** customer er message embed kora; notun message er sathe sobcheye mil 3 ta purono reply model ke dekhano hoy "style only, fact na" bole.
- **Query:** customer er shesh message; khub choto hole ("L", "dam?") ager customer message sathe jora.
- **Prompt:** stable prompt cache hoy. Prottek message e je tothyo ashe seta alada system block e, cache-er pore, tai cache nosto hoy na ar customer seta edit korte pare na.
- **Retrieval fail korle:** customer reply paay, model ke bola hoy "kichu milena", tai se "team confirm korbe" bole.
- Notun table: `knowledge_chunks` (vector 384), `tone_examples`. pgvector extension ekhon migration e.

**8 ta PR:** (1) schema (2) chunker (3) embedder (4) indexing (5) search + eval (6) prompt context (7) engine e jora (8) knowledge UI + docs.

**Kon file:**
- `src/knowledge/` — `chunker.ts`, `embedder.ts`, `indexing.ts`, `retrieval.ts`, `eval-cases.ts`, `testing.ts`
- `src/ai/context.ts`, `src/ai/engine.ts`, `src/ai/prompt.ts`
- `src/server/knowledge.ts`, `src/app/api/knowledge/route.ts`, `src/app/playground/knowledge/page.tsx`
- `scripts/kb-index.mts`, `scripts/kb-eval.mts`

**Kivabe check korben:**
1. `npm run db:reset` (database + index; prothom bar model download hobe)
2. `npm run kb:eval` — ekhon search er maap dekhabe
3. API key boshiye `npm run dev`, `/playground` e "vai delivery charge koto?" likhun. Reply te ৬০ / ১২০ taka ashbe, ar reply er niche "looked at: Delivery, ..." dekhabe.
4. `/playground/knowledge` e nijer ekta notun tothyo add korun, tarpor chat e oi bishoy e jiggesh korun.
5. Jeta document e nai (jemon "gift wrap ache?") seta jiggesh korun: team confirm korbe bolbe, banabe na.

**Ja janar moto:**
- **Banglish e top-1 durbol (79%).** Ekhon 3 ta chunk dewa hoy tai chole; document onek hole (hajar) kharap hobe. Tokhon upay: boro model (BGE-M3 / Voyage / Cohere), ba keyword-matching jora. `kb:eval` e case jog kore maapa jay.
- **Dam / stock ekhono nai** (D4 tools). Knowledge e dam likhle model dam bolbe, kintu dam bodlale document o bodlate hobe; eta hocche D4 er karon.
- **Prothom save ~30 sec** lagte pare (model load).
- Login nai (D8), tai knowledge page jar kache URL ache she-i dekhte pare. Ekhon sudhu local e.
- Production (D9) e local embedding model er jonno server-e onek RAM lagte pare (ami maapi ni); na parle hosted embedding e jete hobe.

---

## D2 — AI engine v1 + local test playground (2026-10-03) — code ready, live check baki

**Ki kora holo:** Customer-er message niye AI reply banay emon engine, ar browser e ekta test chat (`/playground`), login chara. Customer Bangla, Banglish ba English je script e likhbe, AI shei script e, choto choto bubble e reply dibe ar ager kotha mone rakhbe.

**Ja verify kora holo ar ja holo na:**
- Pass: 24 ta automated test, `tsc`, `lint`, `next build`.
- Pass: ashol dev server er upor ekta **fake Anthropic server** diye end-to-end: message save, 2 bubble, history jawa, reset, bhul input, key chara 503.
- **Holo na:** ashol Claude er reply dekha. API key nai, tai model ke sotti-i pathano hoy ni. Fake server proman kore na je Anthropic API amar request ta gohon korbe, ba je reply ta "manusher moto" hobe. Browser e UI click kore dekha o hoy ni (page 200 dey ar compile e kono warning nai, kintu chip/typing/scroll ami dekhi ni).

**Kivabe kora holo:**
- **Model-swappable:** engine shudhu `ChatModel` interface chine (`src/ai/model.ts`). Ekhon Claude, D15 e fine-tuned model eki jaygay boshbe.
- **Default model `claude-opus-5-5`**, effort `low` (choto chat reply, tai druto ar sosta). `.env.local` e `AI_MODEL=claude-sonnet-5-5` likhle kom khoroche cholbe. Opus 5.5 e thinking bondho kora jay na, tai effort e kom rakha hoyeche.
- **Prompt cache:** system prompt prottek turn e hubohu eki (kono tarikh/id nai), tai cache hoy. Ekhon prompt chhoto, tai cache ashole lagbe na; D3 e knowledge dhukle lagbe.
- **Refusal fallback:** Anthropic er safety classifier kokhono reply atkale API nijei onno model e retry kore, customer er message fail hoy na. Eta amar jog kora, apni chan ni; `src/ai/anthropic.ts` e `FALLBACK_MODELS` theke bondho kora jay.
- **Customer message age save:** model fail korleo customer er message hariye jay na.
- **Prompt (`src/ai/prompt.ts`):** script mirror (Bangla / Banglish / English), choto plain text (markdown/bullet nai), ek emoji er beshi na, "As an AI" type stiff kotha nai, `---` diye bubble bhag, ar **dam / stock / policy kokhono guess korbe na**: "amar kache ekhon nei, team confirm korbe" bolbe (D3, D4 te asol data ashbe). Jodi keu sotti jiggesh kore bot kina, AI sotti bolbe. Customer ragi hole, obhijog korle ba "manager lagbe" bolle se team member er kotha bolbe.
- **History:** shesh 30 ta message; AI er ek reply er bubble gulo `---` diye ek turn, customer er pop-pop message ek turn.

**Kon file:**
- `src/ai/` — `engine.ts`, `model.ts`, `anthropic.ts`, `prompt.ts`, `bubbles.ts` + tests
- `src/server/playground.ts` — test chat er conversation
- `src/app/api/playground/route.ts` — API
- `src/app/playground/page.tsx` — chat UI
- `.env.example`, `README.md`

**Kivabe check korben:**
1. https://console.anthropic.com theke API key nin. `C:\my-github\Alora\.env.local` file banan, ete lekhun: `ANTHROPIC_API_KEY=sk-ant-...`
2. `npm run dev`, tarpor http://localhost:3000/playground
3. Niche er chip gulo (ba nijer moto) likhe dekhun: `vai black tshirt ache?`, `দাম কত?`, `price koto?`, `tumi ki bot?`, `I want to talk to a manager`.
4. Dekhun: script mile? choto? manusher moto? dam / stock banay ni to? Ager kotha mone rakhe?
5. Prottek reply er niche model ar token dekhay (koto khoroch hocche bujhte).
6. `npm test` key chara cholbe.

**Ja janar moto:**
- **Ekhon dam / stock bolte parbe na** (ei design). "vai black tshirt ache?" er uttore se jante chaibe kon size, ar bolbe team confirm korbe. Eta D3 (knowledge) ar D4 (tools) e thik hobe. Er age replies er *tone* niye feedback din (D5 er kaj).
- **Khoroch:** per reply ~$0.01 er kache, Opus 5.5 e (amar anuman, nije measure kora na). Playground e token dekha jay.
- **Ek shomoy ek message:** playground e UI Send bondho rakhe; real channel e (D10+) duto message ek shathe ashle queue lagbe.
- Dev server cholar shomoy `db:*` command chalaben na (PGlite ek process).

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
