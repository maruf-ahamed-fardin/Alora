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

## D12 — WhatsApp (WhatsApp Business Cloud API) (2026-10-08)

**Ki kora holo:** WhatsApp Business Cloud API connect korar jonno dedicated channel adapter, webhook handshake endpoint (`GET /api/webhooks/whatsapp`), incoming messages receiver (`POST /api/webhooks/whatsapp`), customer phone number & contact profile mapping, interactive button reply support, message status update (sent/delivered/read) filtering, Send API client (`graph.facebook.com/v21.0/{phone_number_id}/messages`), bidirectional agent takeover with live forwarding from `/inbox` to WhatsApp, ebong CLI diagnostics tool (`npm run wa:setup`) toiri kora holo. WhatsApp e customer message pathale AI automatically Bangla/Banglish e reply dey ebong `/inbox` dashboard e conversation live update hoy; abar human agent inbox theke reply dile sheta direct customer er WhatsApp e deliver hoy.

**Ja verify kora holo ar ja holo na:**
- Pass: 136 ta test (134 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors, zero warnings).
- Pass: `src/server/channels/whatsapp.test.ts` e 6 ta dedicated unit test pass (challenge handshake, message payload parsing & status filtering, interactive button reply extraction, customer/conversation auto-creation with phone, duplicate wamid prevention, agent takeover suppression).
- Pass: `next build` e `/api/webhooks/whatsapp` dynamic server route compile pass.
- **Baki:** D8 (Login / Multi-tenant merchant auth) ebong D9 (Production deploy).

**Kivabe kora holo:**
- **Webhook Handshake & Cloud API Client:** Meta WhatsApp Business verification challenge verify kora hoy (`hub.verify_token`). `sendWhatsAppMessage` function Meta Graph Messages endpoint call kore text messages deliver kore.
- **Payload Parsing & Profile Mapping:** Meta er multiple payload variants (text messages, interactive button replies, list replies) parse kore customer er WhatsApp display name o phone number automatic database er `customers` table e save kora hoy.
- **Idempotency & Takeover:** `wamid` tracking er maddhome duplicate webhook retries safely drop hoy. Agent takeover korle AI chup thake, ebong human agent `/inbox` theke reply pathale (`sendAgentMessage`) sheti direct WhatsApp Cloud API diye customer er phone e deliver hoy.
- **Diagnostics Script:** `npm run wa:setup` CLI script run korle connected WhatsApp business phone number details (display number, verified name, quality rating, verification status) ebong Meta Developer console webhook instructions print hoy.

**Kon file:**
- `src/server/channels/types.ts`
- `src/server/channels/whatsapp.ts`
- `src/server/channels/whatsapp.test.ts`
- `src/app/api/webhooks/whatsapp/route.ts`
- `src/server/inbox.ts` (agent reply forwarding to WhatsApp)
- `scripts/whatsapp-setup.mts`
- `.env.example`, `package.json`, `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` chalale 136 ta test (134 pass, 2 skip) dekhabe.
2. `npm run build` chalale 0 errors o 0 warnings e build pass hobe.
3. Setup check korte:
   - `npm run wa:setup` chalaye WhatsApp Business Phone Number connection dekhun.
   - Meta for Developers -> WhatsApp -> Configuration e Webhook Callback URL boshun:
     `https://<your-domain>/api/webhooks/whatsapp`
   - Verify token: `alora-whatsapp-secret` (ba `.env.local` e apnar deya `WHATSAPP_VERIFY_TOKEN`).
   - Webhook field: Subscribe to `messages`.


## D11 — Messenger + Instagram (Meta Webhooks & Send API) (2026-10-08)

**Ki kora holo:** Facebook Messenger ebong Instagram Direct connect korar jonno Meta Graph Webhook adapter, challenge verification handshake (`hub.mode`, `hub.verify_token`, `hub.challenge`), HMAC SHA256 payload signature verification (`X-Hub-Signature-256`), Send API client, idempotency protection (`mid`), bidirectional takeover with live message forwarding, ebong CLI diagnostics tool (`npm run meta:setup`) toiri kora holo. Facebook Page ba Instagram Direct e customer message pathale AI automatically Bangla/Banglish e reply dey ebong `/inbox` dashboard e conversation live update hoy; abar human agent inbox theke reply dile sheta direct customer er Messenger / Instagram e deliver hoy.

**Ja verify kora holo ar ja holo na:**
- Pass: 130 ta test (128 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors, zero warnings).
- Pass: `src/server/channels/meta.test.ts` e 7 ta dedicated unit test pass (challenge handshake, HMAC sha256 signature verification, echo skipping, Instagram object parsing, customer/conversation auto-creation, duplicate mid prevention, agent handoff suppression).
- Pass: `next build` e `/api/webhooks/meta` ebong `/api/webhooks/messenger` routes compile pass.
- **Baki:** D12 (WhatsApp Cloud API webhook) ebong live Meta Developer App approval (Meta Graph API verification review).

**Kivabe kora holo:**
- **Webhook Handshake & Security:** `GET /api/webhooks/meta` e Meta Dashboard theke verification token request ashe (`hub.verify_token`). Verification match hole 200 OK shoho challenge string return hoy. `POST /api/webhooks/meta` e `X-Hub-Signature-256` header check kore legitimate Meta servers confirm kora hoy.
- **Normalized Multi-Platform Parser:** `parseMetaWebhook` function Facebook Messenger (`object: page`) ebong Instagram Direct (`object: instagram`) duitai handle kore. Bot er nijer reply echoes (`is_echo: true`) ebong delivery receipts automatically filter out kore infinite reply loop protect kore.
- **Bidirectional Send API & Takeover:** `sendMetaMessage` function `https://graph.facebook.com/v21.0/me/messages` call kore text reply deliver kore. Agent takeover korle (`aiEnabled: false`), customer message save hoy kintu AI chup thake. Agent inbox theke reply pathale (`sendAgentMessage`) sheti direct Meta Send API diye customer er phone e deliver hoy.
- **Diagnostics Script:** `npm run meta:setup` CLI script run korle connected Facebook Page identity (name, ID, category), verify token, ebong Meta Developer console e webhook boshannor step-by-step instructions dekhay.

**Kon file:**
- `src/server/channels/types.ts`
- `src/server/channels/meta.ts`
- `src/server/channels/meta.test.ts`
- `src/app/api/webhooks/meta/route.ts`
- `src/app/api/webhooks/messenger/route.ts`
- `src/server/inbox.ts` (agent reply forwarding to Messenger & Instagram)
- `scripts/meta-setup.mts`
- `.env.example`, `package.json`, `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` chalale 130 ta test (128 pass, 2 skip) dekhabe.
2. `npm run build` chalale 0 errors o 0 warnings e build pass hobe.
3. Setup check korte:
   - `npm run meta:setup` chalaye Facebook Page connection o webhook settings dekhun.
   - Meta for Developers (developers.facebook.com) e App Webhook URL boshun:
     `https://<your-domain>/api/webhooks/meta`
   - Verify token: `alora-meta-secret` (ba `.env.local` e apnar deya `META_VERIFY_TOKEN`).
   - Meta "Verify and Save" click korlei instant verified hobe!


## D10 — Telegram (prothom ashol channel) (2026-10-08)

**Ki kora holo:** Alora er prothom ashol external channel **Telegram Bot** connect kora holo! Telegram webhook adapter, incoming update parser, automated AI reply loop, idempotency protection, bidirectional human agent takeover, ebong CLI setup & diagnostics script (`npm run tg:setup`) toiri kora holo. Phone theke Telegram bot e message pathale AI automatically Bangla/Banglish e reply dey ebong `/inbox` dashboard e conversation live update hoy; abar human agent inbox theke reply dile sheta direct customer er Telegram app e chole jay.

**Ja verify kora holo ar ja holo na:**
- Pass: 117 ta test (115 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors, zero warnings).
- Pass: `src/server/channels/telegram.test.ts` e 7 ta dedicated unit test pass (update parsing, /start command, secret token verification, customer/conversation auto-creation, duplicate prevention/idempotency, agent handoff suppression).
- Pass: `next build` e `/api/webhooks/telegram` ebong `/api/webhooks/telegram/setup` routes compile pass.
- **Baki:** D8 (Login / Multi-tenant merchant auth) ebong D11/D12 (Meta WhatsApp / Messenger webhook).

**Kivabe kora holo:**
- **Channel Adapter & Parser:** `src/server/channels/telegram.ts` e Telegram Update payload parse kore text, sender name, user ID, chat ID ber kora hoy. Non-text message gracefully handle hoy, ebong `/start` command e business persona onujayi natural greetings trigger hoy.
- **Auto Customer & Thread Provisioning:** Prothom bar kono user message dile database er `customers` ebong `conversations` table e auto-provision hoy, purono open thread thakle shetai reuse hoy.
- **Idempotency:** Webhook retry te duplicate reply atkate `messages.externalId` check kora hoy; duplicate message_id ashle safe skip kore.
- **Bidirectional Takeover:** Inbox e agent takeover korle (`aiEnabled: false`), customer er message save hoy kintu AI chup thake. Agent jokhon `/inbox` theke reply pathay (`sendAgentMessage`), sheti automatically customer er Telegram chat e `sendMessage` API diye deliver hoy.
- **Security & Setup:** Webhook endpoint e `x-telegram-bot-api-secret-token` header verify kora jay. `npm run tg:setup` CLI tool diye bot identity, pending updates o webhook URL direct set/delete kora jay.

**Kon file:**
- `src/server/channels/types.ts`
- `src/server/channels/telegram.ts`
- `src/server/channels/telegram.test.ts`
- `src/app/api/webhooks/telegram/route.ts`
- `src/app/api/webhooks/telegram/setup/route.ts`
- `src/server/inbox.ts` (agent reply forwarding to Telegram)
- `src/ai/engine.ts` (externalId support in handleCustomerMessage)
- `scripts/telegram-setup.mts`
- `.env.example`, `package.json`, `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` chalale 117 ta test (115 pass) dekhabe.
2. `npm run build` chalale 0 errors o 0 warnings e build pass hobe.
3. Bot test korte:
   - Telegram e `@BotFather` theke ekta bot toiri kore token nin.
   - `.env.local` e `TELEGRAM_BOT_TOKEN=<your_token>` boshaye `npm run tg:setup` chalale bot name o status dekhabe.
   - Local e test korte ngrok ba cloudflare tunnel chalaye webhook set korun:
     `npm run tg:setup https://<your-subdomain>.ngrok-free.app/api/webhooks/telegram`
   - Phone e bot ke message pathan: AI er reply phone e ashbe ebong `http://localhost:3000/inbox` e thread live dekha jabe!


## D7 — PWA (2026-10-08)

**Ki kora holo:** Alora ke ekta fully installable **Progressive Web App (PWA)** hishebe ready kora holo. Mobile phone ba desktop computer e "Add to Home Screen" ba "Install App" click korlei standalone native app er moto chole. Branded vector icons (192x192, 512x512, maskable), Next.js metadata manifest route (`/manifest.webmanifest`), precaching Service Worker (`/sw.js`), floating install prompt, ebong push notification permission o alert dispatcher toiri kora holo. Inbox header e "Install App" o "Enable Alerts / Alerts On" buttons jog kora hoyeche.

**Ja verify kora holo ar ja holo na:**
- Pass: 110 ta test (108 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors).
- Pass: `src/server/pwa.test.ts` unit test pass (subscription tracking, duplicate prevention).
- Pass: `next build` e `/manifest.webmanifest`, `/api/pwa/subscribe`, `/api/pwa/notify` shob routes static/dynamic compile pass.
- Pass: `/sw.js` precache, push handler, o notification click handler working.
- **Baki:** Production deployment (D9) e HTTPS o live domain connect kora (PWA local `localhost` e install support kore, production e HTTPS lagbe).

**Kivabe kora holo:**
- **Next.js Web App Manifest:** `src/app/manifest.ts` e metadata route diye standard `MetadataRoute.Manifest` provide kora hoyeche (standalone display mode, portrait-primary, theme color `#059669`).
- **Branded Icons:** `public/icons/icon-192.svg` o `public/icons/icon-512.svg` e emerald gradient background o Alora spark branding vector toiri kora hoyeche.
- **Service Worker (`public/sw.js`):** Precaches `/`, `/inbox`, `/playground`, `/icons/icon-192.svg`. Handles `push` event to display system notification with sound/vibration pattern, and `notificationclick` event to bring the user directly to `/inbox`.
- **Client PWA Provider (`src/components/pwa-provider.tsx`):** Captures `beforeinstallprompt`, renders unobtrusive floating install banner, provides `usePwa` context with `promptInstall()` and `requestNotificationPermission()`.
- **Push Notification API:** `POST /api/pwa/subscribe` o `POST /api/pwa/notify` endpoints to receive subscriptions and dispatch alerts.

**Kon file:**
- `src/app/manifest.ts`
- `public/sw.js`
- `public/icons/icon-192.svg`, `public/icons/icon-512.svg`
- `src/components/pwa-provider.tsx`
- `src/app/layout.tsx` (PwaProvider, themeColor, viewport, appleWebApp metadata)
- `src/app/inbox/page.tsx` (Install App & Notification toggle buttons)
- `src/server/pwa.ts`, `src/server/pwa.test.ts`
- `src/app/api/pwa/subscribe/route.ts`, `src/app/api/pwa/notify/route.ts`
- `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` diye 110 ti test pass verify korun.
2. `npm run dev` chalaye browser e **`http://localhost:3000/inbox`** e jan:
   - Header e **"Enable Alerts"** click korun — browser notification permission chaibe; "Allow" korle instantly test notification trigger hobe!
   - Browser address bar e ba header e "Install App" button dekhun (Chrome/Edge e desktop app hishebe install kora jay).
   - Phone theke access korle "Add to Home Screen" prompt dekhabe.

---

## D6 — Unified inbox UI (2026-10-08)

**Ki kora holo:** Alora-r jonno ekta premium, mobile-responsive **Unified Inbox** (`/inbox`) toiri kora holo. WhatsApp, Telegram, Messenger, Instagram ebong Playground er shob conversation ek jaygay ashbe. Agent chobi, customer nam, phone, channel badge dekhte parbe, live conversation filter korte parbe (All, Human Needed, Open, Closed, channel onujayi), ek click e **Take Over** kore AI bondho kore manual message pathate parbe, abar **Resume AI** diye AI chalu korte parbe. Pashe customer er previous order history (order number, courier, tracking code) o details panel dekha jay.

**Ja verify kora holo ar ja holo na:**
- Pass: 109 ta test (107 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors).
- Pass: `src/server/inbox.test.ts` e 7 ta dedicated unit test pass (list conversations, message thread, agent reply, toggle AI on/off, change status, order inspection).
- Pass: `db:seed` e 4 ti omnichannel demo conversation (WhatsApp, Telegram handoff, Messenger, Playground) shoho rich test data seeded o `db:check` pass.
- Pass: `next build` e `/inbox`, `/api/inbox/conversations`, `/api/inbox/conversations/[id]`, `/api/inbox/conversations/[id]/messages` shob routes optimized o build pass.
- **Baki:** D7 (PWA - Add to Home Screen, service worker) ebong D10-D12 te ashol social media webhook connect kora.

**Kivabe kora holo:**
- **3-Pane Desktop / 1-Pane Mobile UX:** Left pane conversation list + live search & channel pills; middle pane dynamic chat thread with sender badges (Customer, AI Assistant, You Agent, System note); right pane collapsible customer profile & order history drawer.
- **Agent Takeover & Live Toggle:** `PATCH /api/inbox/conversations/[id]` diye `aiEnabled: false` / `true` toggle hoy. Agent takeover korle thread e automatic system note ashbe ebong AI chup thakbe. Agent direct reply pathale message `sender: "agent"` hishebe save hoy.
- **Customer Simulator Mode:** Local development e testing shohoj korar jonno inbox-ei "Test as Customer" toggle ache, ja diye live message pathiye AI response o agent takeover test kora jay.
- **Omnichannel Branding:** WhatsApp (emerald), Telegram (sky), Messenger (blue), Instagram (pink), Playground (purple) customized badges o icons.

**Kon file:**
- `src/app/inbox/page.tsx`
- `src/server/inbox.ts`, `src/server/inbox.test.ts`
- `src/app/api/inbox/conversations/route.ts`
- `src/app/api/inbox/conversations/[id]/route.ts`
- `src/app/api/inbox/conversations/[id]/messages/route.ts`
- `src/app/page.tsx` (Homepage links to Inbox)
- `scripts/db-seed.mts` (Omnichannel sample conversations)
- `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` chalale 109 ti test pass dekhabe.
2. `npm run dev` chalaye browser e **`http://localhost:3000/inbox`** e jan:
   - Left side e WhatsApp, Telegram, Messenger, Playground conversations dekhun.
   - Tanvir Rahman (Telegram) conversation click korun (eta Handoff mode e ache, AI paused).
   - "Resume AI" click kore AI chalu korun, ba agent reply likhe Send korun.
   - Nusrat Jahan (WhatsApp) conversation e "Take Over" click korun (AI pause hoye jabe).
   - Right side e customer er order details (ORD-1001, tracking code) dekhun.
   - "Test as Customer" mode switch kore live notun message pathiye AI er reply live dekhun.

---

## D5 — Reply tuning + user approval (2026-10-08) — suite & feedback loop ready

**Ki kora holo:** Reply quality, natural chat rhythm, prompt injection protection o Banglish tone tuning er jonno 42 ta realistic customer cases toiri kora holo (`src/ai/reply-eval-cases.ts`). Automated evaluation runner `npm run reply:eval` (`scripts/reply-eval.mts`) jog kora holo ja rhythm (bubble count), formatting (markdown bold/headers), facts inclusion, forbidden robotic phrases o tool accuracy check kore. Playground UI-te "Emon howa uchit chilo?" inline correction feature jog kora hoyeche, ja diye user je kono AI reply correction type kore direct `tone_examples` e save o auto-reindex korte pare (`/api/playground/feedback`). Generous token allocation (`AI_MAX_TOKENS`) o high speed tuning complete kora holo.

**Ja verify kora holo ar ja holo na:**
- Pass: 102 ta test (100 passed, 2 real embedding download test skipped), `tsc`, `next build` (zero errors).
- Pass: `npm run reply:eval` structural validation on all 42 cases (11 categories across Bangla, Banglish, and English).
- Pass: `POST /api/playground/feedback` route unit test (valid input, invalid input, database insertion & embedder re-index).
- Pass: `next build` routes including `/api/playground/feedback` and optimized static playground pages.
- **Baki:** User nijer machine e live model (Anthropic API key ba local Ollama) diye `/playground` e chat kore dekhe "reply mon moto hoyeche" approve kora (Gate).

**Kivabe kora holo:**
- **42 Case Evaluation Suite:** Greetings, product lookup, stock check, delivery charges, customer orders & privacy boundaries (ORD-1001 vs ORD-2001), human handoff, bargaining, prompt injection, and hallucination traps.
- **Rhythm & Tone Validation:** Bubble splitting via `---` strictly maintained (max 2-3 bubbles), markdown formatting banned in prompt & verified in test runner, no robotic clichés ("As an AI", "Certainly!").
- **Playground Inline Correction:** AI reply bubble er niche "Emon howa uchit chilo?" click korle correction input ashe. Save korle RAG er `tone_examples` e chole jay ebong poroborti similar query te model shei desired tone example follow kore.
- **Speed & Token Optimization:** `AI_EFFORT=low`, configurable `AI_MAX_TOKENS=8000` for Anthropic & Ollama adapters.

**Kon file:**
- `src/ai/reply-eval-cases.ts`, `scripts/reply-eval.mts`
- `src/app/api/playground/feedback/route.ts`, `src/app/api/playground/feedback/route.test.ts`
- `src/app/playground/page.tsx`, `src/app/api/playground/route.ts`
- `src/ai/prompt.ts`, `src/ai/factory.ts`, `src/ai/ollama.ts`, `.env.example`, `package.json`
- `docs/PLAN.md`, `docs/WORKLOG.md`

**Kivabe check korben:**
1. `npm test` diye 102 ta unit test check korun.
2. `npm run reply:eval` run kore 42 ta case er evaluation breakdown dekhun.
3. Model configure kore (`.env.local` e `ANTHROPIC_API_KEY` ba `AI_PROVIDER=ollama`) `npm run dev` chalaye `http://localhost:3000/playground` e jan:
   - SAMPLES er notun button gulo click korun ("discount dewa jay na?", "sylhet e delivery charge koto?").
   - Kono reply pochhondo na hole bubble er niche "Emon howa uchit chilo?" click kore apnar mon moto reply likhe "Save Example" korun.
   - Re-test kore dekhun model oi tone dhorche kina.

**Ja baki / janar moto:**
- User playground e test kore "reply mon moto hoyeche" approve korle D5 `[x]` hobe ebong Stage C (D6: Unified inbox UI) shuru kora jabe.

---

## D4 — Tools (2026-10-04) — code ready, live check baki

**Ki kora holo:** AI ekhon dam, stock, delivery charge ar order er status **nijer thekei na bole database theke dekhe** bole. Customer "white tshirt L size ache?" likhle AI database dekhe bole L sold out, M ar XL ache. "ORD-1001 kothay?" likhle shudhu **oi customer er nijer** order dekhay; onno customer er order number dile "paoa jay ni" bole. Customer rege gele ba refund chaile AI `handoff_to_agent` diye chat team ke diye dey ar nije chup hoye jay.

**Ja verify kora holo ar ja holo na:**
- Pass: 97 ta test (95 pass, 2 ashol embedding model er test default e skip), `tsc`, lint, `next build`, `db:check` (11 table).
- Pass: dev server + ashol embedder + **fake Claude** (`ANTHROPIC_BASE_URL` diye) diye `/api/playground`: black tshirt -> price 1300 ar stock; white L -> sold out; Sylhet -> 120 taka; ORD-1001 -> shipped, Pathao; ORD-2001 (onno customer er) -> paoa gelo na; refund -> handoff, tarpor "hello?" te AI chup.
- **Holo na:** ashol Claude er tool bebohar. API key nai, tai "kon tool kokhon dhore", "dam na jene bole dey ki na", "handoff khub tara tari dey ki na" amra jani na. Eta D5 tuning er kaj.

**Kivabe kora holo:**
- **Tool = ekta function + description + input schema.** Model ke tool er list dewa hoy. Model "get_product(black tshirt)" chay, amra database e chalai, result model ke ferot dei, model tokhon uttor likhe. Eta ekta loop (maximum 5 round).
- **Keno tool, keno prompt e na:** dam/stock proti ghontay bodlay. Prompt e likhle cache nosto hoy ar purono dam thake. Tool shobshomoy ajker data dey.
- **Security:** `business_id` ar `customer_id` model er input theke ashe na, conversation theke ashe (`ToolContext`). Model ja-i likhuk, onno shop ba onno customer er data dekhte pare na. Order na pele "paoa jay ni" ei ek-i uttor, tai order number guess kore dekhar upay nai.
- **Tool fail korle:** bhul input / unknown tool / database error model ke error hishebe dewa hoy (details na), customer er message fail hoy na.
- **`get_product` search:** name, SKU, colour er upor; "T-shirt" / "tshirt" / "t shirt" shob ek. 3 okkhorer choto shobdo ("er", "ta") dhora hoy na. Catalogue choto tai memory te filter kora; boro hole SQL search lagbe.
- **`get_delivery_charge`:** `delivery_zones` table e zone er keyword ("dhaka", "ঢাকা", "dhanmondi") theke area mele; na mille default zone ("Outside Dhaka") ar bole je eta ashumed rate. 3000 takar *upore* free (3000 porjonto na). Seed e Delivery document er shathe mil rakha ache.
- **`handoff_to_agent`:** `conversations.status = handoff`, `ai_enabled = false`, ar team er jonno ekta `system` note. Duibar dile duita note hoy na.
- Model interface (`ChatModel`) e `tools` jog hoyeche, tai D15 e onno model e eki tool dewa jabe.

**6 ta PR:** (1) schema (2) seed (3) tools (4) model tool loop (5) engine + prompt + playground (6) docs.

**Kon file:**
- `src/ai/tools/` — `types.ts`, `catalog.ts` (get_product, check_stock), `delivery.ts`, `orders.ts`, `handoff.ts`, `index.ts`
- `src/ai/anthropic.ts` (tool loop), `src/ai/model.ts`, `src/ai/engine.ts`, `src/ai/prompt.ts`
- `src/db/schema.ts`, `drizzle/0003_delivery_and_orders.sql`, `scripts/db-seed.mts`
- `src/app/playground/page.tsx`

**Kivabe check korben:**
1. `npm run db:reset` (dev server bondho rekhe), tarpor `npm run db:check` ar `npm test`.
2. API key boshiye `npm run dev`, `/playground` e (reply er niche "tools: ..." dekhabe):
   - "white tshirt L size ache?" -> L nai, M / XL ache bolbe.
   - "navy hoodie ache?" -> sold out bolbe, dam banabe na.
   - "sylhet e delivery charge koto?" -> ১২০ taka, ৩-৫ din.
   - "ORD-1001 kothay?" -> shipped, Pathao, tracking PT-884213.
   - "ORD-2001 kothay?" -> paoa jay ni bolbe (eta onno customer er order).
   - "refund chai" -> team nibe bolbe, tarpor chat e system note ashbe ar AI ar reply dibe na. "Start over" dile abar kaj kore.
3. Dam bodlate chaile `scripts/db-seed.mts` e dam bodle `npm run db:reset` korun; AI notun dam bolbe (kono prompt bodlate hobe na).

**Ja baki / janar moto:**
- Order placing/cancel tool nai (shudhu dekha). Order chaile AI details nei ar handoff kore; eta D5 e dekhte hobe apnar pochhondo hoy ki na.
- Handoff er por AI chup; team jokhon uttor debe sheta inbox (D6) e hobe. Ekhon playground e "Start over" chhara fire asha jay na.
- Stock er exact number shudhu 3 ba kom thakle bolar kotha prompt e likha; eta tuning er bishoy.

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
