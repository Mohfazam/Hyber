# Hyber — Build Progress & Context

**Last updated:** as of the Razorpay Tier 1 module handoff (credentials setup pending)
**Purpose of this doc:** paste this into a new conversation to restore full context on what's built, what's tested, what's pending, and key architectural decisions — instead of re-explaining from scratch.

---

## 1. What this project is

Razorpay Buildathon — Track 01 (AI Growth & Agentic Commerce). An AI voice salesperson lets shoppers browse an agent-readable catalog (extended schema.org Product) and complete purchases by voice, in their native language, with every money action explainable, bounded, and gated through Razorpay.

Full product reasoning lives in `01-product-overview.md` and `02-technical-architecture.md` (produced earlier in this build) — this doc is the **status tracker**, those are the **design reference**.

Repo name: `Hyber` (turborepo, pnpm workspaces).

---

## 2. Build order being followed

```
Schema design → Catalog API → Agent + tool-calling → Gating + Audit → Razorpay Tier 1 → Voice pipeline → Frontend polish
```

## 3. Current status

| Module | Status | Notes |
|---|---|---|
| `packages/db` (Drizzle schema) | ✅ Done, verified | 5 tables: products, sessions, orders, gating_decisions, audit_log |
| Seed data | ✅ Done | 102 products across 6 categories, all schema fields populated |
| Catalog API (`apps/backend/src/catalog/`) | ✅ Done, verified | search, get-by-sku, live availability, schema.org JSON-LD serializer, self-describing `/catalog/schema` doc |
| Agent Orchestrator (`apps/backend/src/agent/`) | ✅ Done, verified | Gemini tool-calling, session persistence, multi-turn memory confirmed working |
| Gating Engine (`apps/backend/src/gating/`) | ✅ Done, verified | Confirmation check, live stock re-check, threshold flag — all logged |
| Audit Log (`apps/backend/src/audit/`) | ✅ Done, verified | Full decision trail queryable via `/audit/session/:sessionId` |
| Razorpay Tier 1 (`apps/backend/src/payments/`) | 🟡 **Code written, NOT yet configured or tested** | See §6 below — this is the current blocker/next step |
| Voice pipeline (Sarvam AI) | ⬜ Not started | Planned after Razorpay Tier 1 is verified |
| Frontend | ⬜ Not started | Bare chat UI planned in parallel once agent flow is stable; polish comes last |

---

## 4. Architecture decisions locked in (don't relitigate these)

- **Turborepo, pnpm.** `packages/db` (Drizzle ORM schema/client), `apps/backend` (single Node/Express app with internal modules), `apps/web` (Next.js, not yet built).
- **Single `apps/backend` app**, not split into many packages — internal folder structure enforces module boundaries instead (catalog/, agent/, gating/, payments/, audit/, common/, config/).
- **Layered pattern per module:** `*.types.ts`, `*.validators.ts` (Zod), `*.service.ts` (business logic, DB access), `*.controller.ts` (thin HTTP layer), `*.routes.ts` (verb+path mapping only, no logic).
- **Critical architectural rule:** the Agent Orchestrator (`agent.tools.ts`) has NO tool that calls Razorpay directly. Its only money-adjacent tool is `propose_purchase`, which calls into `gating.service.ts`. Only `gating.service.ts` is allowed to import and call `payments.service.ts`. This is enforced by what capabilities exist in code, not by prompting — the agent architecturally cannot skip the gate.
- **Catalog data:** Postgres (not Mongo) — `products` table has structured columns for queryable fields (price, category, gender, size, etc.) plus a `jsonb` `extensions` column for `discountRules`, `liveAvailabilityEndpoint`, etc. Prices stored in **paise** (integer), never floats.
- **Catalog output:** flat DB rows are serialized into proper schema.org JSON-LD (`@context`, `@type`, `offers`, etc.) in `catalog.serializer.ts` — kept separate from `catalog.service.ts` so DB shape and public API shape can evolve independently.
- **Gating Engine checks (current logic):**
  1. `user_confirmed` — must be true, blocks the gate if false
  2. `live_stock_check` — re-verifies availability at purchase time (not trusting stale conversation state), blocks the gate if out of stock
  3. `amount_threshold` — informational/logged only for now (compares against each product's `requiresConfirmationAbove` field); does NOT block yet, since there's no OTP/escalation step built to route into. This will need real enforcement once OTP is added.
- **Every gate decision is persisted** to `gating_decisions` (full check breakdown) AND logged to `audit_log` via a single shared `auditService.logAction()` function — this is the explainability evidence for the buildathon's "Bar" requirement.
- **OTP decision (from earlier discussion, not yet built):** OTP will be **typed**, not spoken, at the final payment-confirmation step — voice handles the sales conversation, but the money-authorization moment switches to typed input. Reasoning: spoken OTP has replay risk, STT misrecognition risk, and shoulder-surfing risk that typed input avoids. This still needs to be implemented.
- **Webhook-only trust model for payments:** the system never marks an order "paid" based on a client-side success callback — only a signature-verified webhook (HMAC-SHA256, `crypto.timingSafeEqual`) from Razorpay's servers is trusted. This is implemented in `payments.controller.ts` / `payments.service.ts`.
- **Model naming resilience:** Gemini model name is an env var (`GEMINI_MODEL`), not hardcoded — Google has deprecated model names mid-build twice already during this project (`gemini-2.5-flash` → `gemini-3.6-flash` → settled on `gemini-3.5-flash-lite`). If the agent starts throwing `404 model not found` again, just update `.env`, no code changes needed.

---

## 5. Known deferred/incomplete pieces (intentional, not bugs)

- **Amount threshold in gating is not yet a hard block** — it's logged and flagged but doesn't stop a purchase. Real enforcement needs the OTP/escalation step, which isn't built.
- **No OTP flow yet.** Currently `propose_purchase` → gate passes → Razorpay order created directly. The planned design (typed OTP before payment) is not implemented.
- **Refunds, Payment Links, Customers API** — deliberately scoped as "Tier 2, after Tier 1 works end-to-end." Not started.
- **No frontend yet** — everything has been tested via PowerShell `Invoke-RestMethod` calls directly against the backend API.
- **Voice (Sarvam AI)** — not started. Planned after Razorpay Tier 1 is fully verified end-to-end (order creation + webhook-confirmed payment).

---

## 6. Immediate next step — Razorpay Tier 1 setup (NOT YET DONE)

Code for `apps/backend/src/payments/` is written (types, service, controller, routes) and `gating.service.ts` / `agent.tools.ts` / `app.ts` are updated to call it — but **none of this has been configured or tested yet.** Explicitly deferred by the user to "do later." Needed before it can be tested:

1. **Get Razorpay test-mode credentials** — Dashboard → Test Mode → Settings → API Keys → generate `key_id` + `key_secret`.
2. **Add to `apps/backend/.env`:**
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=your_test_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```
3. **Set up a tunnel for webhook testing** — Razorpay can't hit `localhost` directly:
   ```powershell
   npx cloudflared tunnel --url http://localhost:4000
   ```
4. **Create a webhook in the Razorpay Dashboard** pointing to `https://<tunnel-url>/payments/webhook`, subscribed to `payment.captured` and `payment.failed`, with a webhook secret matching step 2.
5. **Install the SDK if not already done:**
   ```powershell
   pnpm add razorpay
   ```
6. Run the server, repeat the standard test flow (create session → search → confirm purchase), and confirm `propose_purchase` returns a **real Razorpay order ID** (not the old stub). Check the `orders` table in Drizzle Studio for a `status: 'created'` row with a real `razorpay_order_id`.
7. **Full payment completion loop is not testable yet** without a checkout UI to actually trigger a test payment — that requires either a minimal frontend trigger or manual API-based test payment simulation. Decide this once step 6 is confirmed working.

---

## 7. Key file locations (for quick orientation)

```
Hyber/
├── apps/
│   └── backend/
│       ├── .env                          — DATABASE_URL, PORT, GEMINI_*, RAZORPAY_* (not yet filled for Razorpay)
│       └── src/
│           ├── config/env.ts             — Zod-validated env vars, fails fast at boot
│           ├── common/                   — AppError classes, global error handler middleware
│           ├── catalog/                  — search, get-by-sku, schema.org serializer
│           ├── agent/                    — Gemini tool-calling orchestrator, session persistence
│           ├── gating/                   — the checkpoint: confirmation + stock + threshold checks
│           ├── audit/                    — logAction(), read endpoints for the trail
│           ├── payments/                 — Razorpay order creation + webhook verification (untested)
│           ├── app.ts                    — Express app, route mounting (webhook needs raw body, mounted before global json parser)
│           └── server.ts                 — the only file that calls .listen()
└── packages/
    └── db/
        ├── .env                          — DATABASE_URL
        ├── drizzle.config.ts
        └── src/
            ├── schema/                   — products, sessions, orders, gating_decisions, audit_log
            ├── client.ts                 — Drizzle client singleton
            └── seed.ts                   — 102 synthetic products
```

---

## 8. Environment/tooling notes worth remembering

- **pnpm workspace**, not npm/yarn — all install commands are `pnpm add`, `pnpm add -D`.
- **TypeScript module resolution** is set to `bundler` (not `node16`/`nodenext`) in every package's `tsconfig.json`, specifically so relative imports don't require `.js` extensions.
- **`.env` files are per-package/per-app**, not shared — `packages/db/.env` and `apps/backend/.env` both need `DATABASE_URL` independently; env vars don't propagate across workspace packages automatically.
- **`dotenv/config` must be imported at the very top of any entrypoint** (`server.ts`, or the top of `client.ts` in `packages/db`) — import order matters, since downstream modules may read `process.env` at module-load time, before a later `dotenv/config` import would have run.
- **pnpm's build-script gate:** new dependencies with native binaries (esbuild, protobufjs, etc.) get their postinstall scripts blocked by default — run `pnpm approve-builds` from the repo root when this happens.
- **Windows/PowerShell specifics used throughout:** `Invoke-RestMethod` (not `curl` aliasing to `Invoke-WebRequest`, which prompts a security warning) for testing endpoints; here-string (`@' ... '@`) blocks used to write multi-file content in one pasted command.

---

## 9. How to resume a coding session quickly

1. Start Postgres (Docker container, if not already running): `docker ps` to check, `docker start Hyber-postgres` if stopped.
2. From `apps/backend`: `pnpm exec tsx src\server.ts`
3. Standard smoke test:
   ```powershell
   $session = Invoke-RestMethod -Method Post -Uri http://localhost:4000/agent/session -Body (@{} | ConvertTo-Json) -ContentType "application/json"
   $sessionId = $session.data.sessionId
   $r1 = Invoke-RestMethod -Method Post -Uri http://localhost:4000/agent/message -Body (@{ sessionId = $sessionId; message = "I'm looking for running shoes for men, size UK 9" } | ConvertTo-Json) -ContentType "application/json"
   $r1.data.reply
   ```
4. Check audit trail for any session: `Invoke-RestMethod "http://localhost:4000/audit/session/$sessionId" | ConvertTo-Json -Depth 10`