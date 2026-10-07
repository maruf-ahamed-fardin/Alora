# Alora — Master Plan

> **Alora** ("Alap" theke inspired): ekta multi-business SaaS. WhatsApp, Messenger, Instagram, Telegram (pore X) er customer message ek jaygay ashbe, ar AI Bangla / Banglish / English e manusher moto reply dibe.

**Ekhon kon destination:** Omnichannel channels (`D10` Telegram, `D11` Messenger/Instagram, `D12` WhatsApp) shob complete! Porer destination: `D8` — Login / Multi-business ba `D9` — Production deploy.

---

## Kaj korar niyom

1. **Ek shomoy ekta destination.** Ekta shesh na hole porer ta shuru hobe na.
2. Protita destination shesh hole **review** dite hobe: ki kora holo, kivabe kora holo, kon file e, kivabe check korte hoy. Review ta chat e bola hobe ar `docs/WORKLOG.md` te lekha thakbe.
3. Review er pore user "porer ta koro" bolle tobe porer destination.
4. Destination shesh hole niche status `[x]` kora hobe ar upore "Ekhon kon destination" update hobe.
5. **Age reply, pore baki shob.** Stage A ar B pura **local computer e** cholbe, login chara. User nije playground e test kore reply "mon moto hoyeche" na bola porjonto (D5 gate) login, production ba kono social media connect er kaj shuru hobe na.

Status: `[ ]` baki · `[~]` cholche · `[x]` shesh

---

## Pura system ek nojore

```
WhatsApp / Messenger / Instagram / Telegram
        │  webhook
        ▼
Channel adapter  →  common message format  →  queue
        ▼
AI engine:  1. kon business? (business_id)
            2. knowledge khoja (RAG)
            3. customer history + tone example
            4. tool call (dam, stock, order)
            5. reply, na parle human handoff
        ▼
Eki channel e reply  +  unified inbox (PWA dashboard)
```

Stage A ar B te shudhu majher "AI engine" ongsho ta toiri hobe, ar channel er jaygay thakbe local test playground.

**"Nijer moto train" er 3 layer**

| Layer | Ki shekhay | Kivabe | Kon destination |
|---|---|---|---|
| Business knowledge | Product, dam, stock, policy, FAQ | Upload, RAG + database | D3, D4 |
| Tone / style | "Vai/apu", emoji, choto reply | Business er nijer bhalo purono reply, example hishebe | D3, D5 |
| Nijer fine-tuned model | Banglish variation, consistent style | QLoRA, Colab | D15 |

Dam / stock / policy kokhono model er vitore train hobe na, shob shomoy database theke ashbe.

**Stack (thik kora):** Next.js + TypeScript + Tailwind (PWA) · Node backend · PostgreSQL + pgvector · Redis queue · WebSocket · Python shudhu D15 te.
Protita table e `business_id` thakbe (multi-tenant), login na thakleo. Local e ekta "test business" age theke boshano thakbe.

---

## Destinations

### Stage A — Foundation (local)

#### [x] D0 — Project setup
- **Ki hobe:** Next.js + TypeScript + Tailwind project, folder structure, git init, env file er niyom.
- **Shesh mane:** `npm run dev` dile browser e Alora er ekta khali home page ashe.

#### [x] D1 — Database (login chara)
- **Ki hobe:** Local PostgreSQL (PGlite, kichu install lage na), schema (businesses, channels, customers, conversations, messages, products, knowledge_documents), ar ekta seeded demo business. Login / signup ekhane nai.
- **Shesh mane:** Ek command e database toiri hoy ar test business er data dekha jay.

### Stage B — AI er matha (local, reply mon moto kora)

#### [x] D2 — AI engine v1 + local test playground
- **Ki hobe:** Browser e ekta test chat (login chara). System prompt, persona, conversation memory, customer je script e likhe (Bangla / Banglish / English) shei script e reply.
- **Shesh mane:** Playground e "vai dam koto?" likhle shabhabik Banglish reply ashe ar ager message mone rakhe.
- **Status:** code, test (24 ta) ar fake-server end-to-end pass.

#### [x] D3 — Knowledge + tone "training"
- **Ki hobe:** FAQ / policy / business info upload, embedding + pgvector search (RAG), tone example (purono bhalo reply) jog kora.
- **Shesh mane:** Upload kora delivery policy niye proshno korle shothik uttor dey; na janle banay na, "check kore janacchi" bole.
- **Status:** Search ashol model diye verify kora (97% top-3), upload UI, edit, delete, tenant isolation, 61 test pass.

#### [x] D4 — Tools (real-time data)
- **Ki hobe:** Tools: `get_product`, `check_stock`, `get_delivery_charge`, `get_order`, `handoff_to_agent`.
- **Shesh mane:** Dam / stock er uttor database theke ashe; database e na thakle AI nijer theke dam bole na.
- **Status:** 5 ta tool, model tool loop, security boundaries, delivery zones, orders table, 97 test pass.

#### [x] D5 — Reply tuning + user approval  ⛳ GATE
- **Ki hobe:** User playground e nijer moto test korbe. Je reply pochhondo na, sheta mark kore "emon howa uchit chilo" likhbe; shei onujayi prompt, persona, tone example thik kora hobe. Chat rhythm (choto message, bhag kore pathano) ekhane thik hobe. 30–50 message er ekta choto test set rakha hobe jate ekta thik korte giye onno ta na bhange.
- **Shesh mane:** User bole **"reply mon moto hoyeche"**. Er age Stage C / D shuru hobe na.
- **Status:** 42-case evaluation suite (`src/ai/reply-eval-cases.ts`), `npm run reply:eval` runner, playground inline correction feature ("Emon howa uchit chilo?"), fixed price bargaining rules, unlimited token/speed configuration pass. User approval complete.

### Stage C — Dashboard

#### [x] D6 — Unified inbox UI
- **Ki hobe:** Premium, mobile responsive inbox: conversation list, chat window, channel badge, AI on/off, human takeover, real-time update.
- **Shesh mane:** Phone ar desktop dui jaygay inbox thik dekhay; agent takeover korle AI thame.
- **Status:** 3-pane responsive inbox (`/inbox`), channel badges (WhatsApp, Telegram, Messenger, Instagram, Playground), one-click Takeover & Resume AI toggles, conversation filtering, customer & order inspector, live polling, 109 test pass, next build pass.
- **User er kaj:** Meta developer account + business verification er jonno apply kora (approval e deri hoy, D11 e lagbe).

#### [x] D7 — PWA
- **Ki hobe:** Installable app (manifest, service worker), push notification.
- **Shesh mane:** Phone e "Add to Home Screen" kora jay ar notun message e notification ashe.
- **Status:** Web App Manifest (`src/app/manifest.ts`), 192x192 & 512x512 branded vector icons, precaching Service Worker (`public/sw.js`), floating install prompt + "Install App" button in header, push notification permission & test alert dispatcher, 110 test pass, next build pass.

### Stage D — Login, production, channel connect

#### [ ] D8 — Login + multi-business
- **Ki hobe:** Signup / login, protita user ekta business er sathe jukto, test business er jaygay ashol business account.
- **Shesh mane:** Signup kore login kora jay; ek business onno business er data dekhte pay na.

#### [ ] D9 — Production deploy
- **Ki hobe:** Server + database hosting, domain, HTTPS, secret / env setup, public webhook URL. Local PGlite theke hosted PostgreSQL (pgvector shoho) e switch: `src/db/client.ts` e driver bodlano, schema ar migration eki thakbe.
- **Shesh mane:** Live URL e login kore playground e reply paowa jay.
- **Age lagbe:** *Open decision 2* (hosting).

#### [x] D10 — Telegram (prothom ashol channel)
- **Ki hobe:** Channel adapter er common format, webhook, queue, dashboard e bot token diye connect.
- **Shesh mane:** Telegram bot e message dile AI reply ashe ar inbox e dekha jay.
- **Status:** Telegram channel adapter (`src/server/channels/telegram.ts`), webhook receiver (`POST /api/webhooks/telegram`), setup endpoint (`/api/webhooks/telegram/setup`), CLI setup & diagnostics tool (`npm run tg:setup`), webhook secret verification, externalId idempotency, bidirectional agent reply forwarding directly to Telegram user, 117 tests pass (115 pass, 2 download skip), next build 0 errors & 0 warnings.

#### [x] D11 — Messenger + Instagram
- **Ki hobe:** "Connect Facebook Page" login flow, webhook, Send API, 24 ghonta window er niyom.
- **Shesh mane:** Test page e message dile AI reply ashe.
- **Status:** Meta Graph Webhook adapter (`src/server/channels/meta.ts`), webhook endpoints (`/api/webhooks/meta`, `/api/webhooks/messenger`), challenge verification (`hub.mode`, `hub.verify_token`, `hub.challenge`), HMAC sha256 signature verification (`X-Hub-Signature-256`), echo skipping, Send API client, auto customer & thread provisioning, bidirectional human agent takeover with live forwarding to Messenger/Instagram, CLI setup & diagnostics script (`npm run meta:setup`), 130 tests pass (128 pass, 2 download skip), next build 0 errors & 0 warnings.

#### [x] D12 — WhatsApp
- **Ki hobe:** WhatsApp Cloud API, number connect, template message.
- **Shesh mane:** Test number e message dile AI reply ashe.
- **Status:** WhatsApp Cloud API Webhook adapter (`src/server/channels/whatsapp.ts`), webhook endpoint (`/api/webhooks/whatsapp`), challenge verification (`hub.mode`, `hub.verify_token`, `hub.challenge`), customer phone & contact profile mapping, interactive button reply extraction, message status receipt filtering, Send API client (`graph.facebook.com/v21.0/{phone_id}/messages`), bidirectional takeover with live forwarding from `/inbox` to WhatsApp, CLI setup & diagnostics script (`npm run wa:setup`), 136 tests pass (134 pass, 2 download skip), next build 0 errors & 0 warnings.

### Stage E — Quality + business

#### [ ] D13 — Evaluation + correction loop
- **Ki hobe:** D5 er choto test set ke 500+ message e boro kora, score report; dashboard e "bhul reply → human correction → approved example" flow.
- **Shesh mane:** Ek command e test chole ar score dekhay; correction porer reply te kaj kore.

#### [ ] D14 — Analytics + billing
- **Ki hobe:** Message count, AI vs human reply, usage limit, subscription plan.
- **Shesh mane:** Business owner nijer usage dekhte pay; limit par hole thame.

### Stage F — Advanced (optional)

#### [ ] D15 — Nijer fine-tuned model
- **Ki hobe:** Anonymized data theke JSONL, Colab e QLoRA, D13 er eki test set e hosted model er sathe compare.
- **Shesh mane:** Dui model er score pashapashi; jitle engine e swap kora jay.

#### [ ] D16 — X (Twitter) + website chat widget
- **Ki hobe:** X DM adapter (paid API), website e boshano chat widget.

---

## Open decisions

| # | Proshno | Kokhon lagbe | Status |
|---|---|---|---|
| 1 | AI engine hosted model (paid API, recommended: Claude Opus 5.5; kom khoroche Sonnet 5.5 / Haiku 4.5) diye shuru, naki shudhu free / self-hosted? | D2 er age | Hosted Claude dhora hoyeche (user D2 shuru korte bolechhe). User ke API key dite hobe. Model `AI_MODEL` env diye bodlano jay. |
| 2 | Hosting kothay (server, database)? | D9 er age | Baki |
| 3 | Embedding model kon ta (Voyage / Cohere multilingual, ba self-hosted BGE-M3)? | D3 er age | Local `multilingual-e5-small` diye shuru (key lage na, ~120 MB, ekbar download). `Embedder` interface er pichone, tai Voyage / Cohere / BGE-M3 pore boshano jay; vector size bodlale migration + re-index lagbe. Banglish e weak (top-1 e), kb:eval e dekha jay. |

Engine **model-swappable** kore banano hobe, jate decision 1 pore bodlano jay.
