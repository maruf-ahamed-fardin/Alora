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
