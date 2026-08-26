# RAG AI Agent — App Store Submission Guide

Based on Shopify's current App Store requirements (fetched 2026-08-26) and an audit of this repo. Category, billing, and reviewer-access decisions below were confirmed with the developer; everything else is drawn from the actual code.

## 1. Requirements audit

| Bucket | Status | Notes |
|---|---|---|
| Session token / embedded auth | ✅ | `@shopify/shopify-app-react-router` handles this; `AppProvider embedded` in [app/routes/app.tsx](app/routes/app.tsx) |
| Shopify Checkout only | ✅ | App doesn't touch checkout/payments |
| Billing via Shopify Billing API | ✅ | `billing.require()` gates every embedded route in [app.tsx:16-20](app/routes/app.tsx#L16-L20); single `MONTHLY_PLAN` at $19.99/mo, 7-day trial, defined in [shopify.server.ts](app/shopify.server.ts) |
| GraphQL Admin API only (no REST) | ✅ | No `admin.rest` / `restResources` usage found anywhere in `app/` |
| OAuth immediately after install | ✅ | Standard template flow, unmodified |
| Valid TLS | ✅ | Vercel provides this automatically |
| Scopes justified | ✅ | `write_products, write_metaobjects, write_metaobject_definitions, read_orders, read_customers, read_inventory, read_locations, read_discounts, read_fulfillments, read_content` — none are Shopify's "sensitive" scopes (no `read_all_orders`, `write_payment_mandate`, etc.) |
| Protected customer data (Level 2) | ❌ Blocking | [sync.server.ts:90](app/lib/shopify-data/sync.server.ts#L90) queries `email` on orders; [sync.server.ts:146-148](app/lib/shopify-data/sync.server.ts#L146-L148) queries `email`, `firstName`, `lastName` on customers — these are Shopify's defined Level 2 fields (name/address/phone/email). Confirmed needed (agent references customers by name/email in answers). **Currently blocked**: Shopify is refusing access until the Partner Dashboard "Data protection details" declaration and per-field access request are completed — see §1a. |
| GDPR webhooks | ✅ | `webhooks.customers.data_request.tsx`, `webhooks.customers.redact.tsx`, `webhooks.shop.redact.tsx` all present |
| Privacy policy | ✅ | [app/routes/privacy.tsx](app/routes/privacy.tsx) — public, unauthenticated, covers collection/use/retention/third parties/contact |
| Terms of service | ✅ | [app/routes/terms.tsx](app/routes/terms.tsx) covers AI-content disclaimer, BYO-key disclaimer, acceptable use, termination, and now a Subscription and billing section (price, trial, auto-renewal, no partial refunds, price-change notice) |
| `isTest` wiring | ✅ | `isTestCharge = process.env.NODE_ENV !== "production"`, used consistently in `app.tsx`, `app.settings.tsx`, `api.billing.cancel.tsx` |
| Online Store / POS requirement | ✅ Neither required | No theme app extensions, no `extensions/` directory content, no POS scopes — app is Admin-API-only. State this explicitly in the listing so reviewers don't need to check. |
| Reviewer can exercise the app | ❌ Blocking | Production has no fallback `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` set yet (per your confirmation). Reviewer instructions **must** direct the reviewer to add their own key in Settings, or you set fallback keys before submitting. See §6. |
| Emergency dev contact (Partner Dashboard) | ⚠️ Manual step | Not checkable from the repo — set in Partner Dashboard → App setup → App information. Recommended: rebucasrandy1986@gmail.com (confirm this inbox is actively monitored). |
| Screenshots / demo screencast | ❓ Not started | Asset work outside this repo — see §7. |

## 1a. Protected customer data access (blocking — do this first)

Partner Dashboard → **Apps → RAG AI Agent → API access requests → Protected customer data access → Request access**.

**Overall reason (the general "why does this app need protected customer data" field, before the per-field list):**

> "RAG AI Agent is an AI assistant embedded in the Shopify admin that answers merchant questions using their store's own data and proposes store changes for merchant approval. Customer name and email are used only to let the agent identify and reference a specific customer when the merchant asks about them — e.g., repeat-purchase history, order patterns, or customer-specific recommendations. This data is only ever displayed back to the authenticated merchant inside their own embedded admin session, is never shared with third parties beyond the AI provider (Anthropic/OpenAI) processing the merchant's own request, and is deleted on uninstall per our GDPR webhooks and privacy policy."

**Fields to request, with justification text to paste in:**

| Field | Where it's used | Justification |
|---|---|---|
| Customer name (first/last) | [sync.server.ts:147-148](app/lib/shopify-data/sync.server.ts#L147-L148), agent responses | "Used so the AI assistant can reference a specific customer by name when the merchant asks a question about them (e.g. repeat-purchase patterns, order history) — never displayed outside the merchant's own embedded admin session." |
| Customer email | [sync.server.ts:146](app/lib/shopify-data/sync.server.ts#L146) | "Used as the unique identifier the merchant recognizes when asking about a specific customer, and to correlate a customer across orders." |
| Order email | [sync.server.ts:90](app/lib/shopify-data/sync.server.ts#L90) | "Used to associate an order with the customer who placed it when the merchant asks order-specific questions." |

**Do not check Phone or Address** — verified via `grep` that neither field is queried anywhere in `app/lib/shopify-data`. Requesting fields the app doesn't use is a compliance red flag in review (Shopify checks for minimum-necessary access) and means attesting to safeguards for data you don't actually touch.

**Data protection details (self-attestation — only submit what's actually true):**

Before checking these boxes, verify each one against your actual production setup (Postgres on your host, Vercel deploy) — a false attestation here is worse than a delayed submission:

- [ ] Backups of the production database are encrypted at rest
- [ ] Development/test environments are separated from production data (a dev store's data doesn't flow into the same DB as production merchants, or is clearly isolated)
- [ ] Access to the production database is limited to specific staff/service accounts, not broadly shared credentials
- [ ] Strong authentication (not just a password) protects any account with data access
- [ ] Some form of access logging exists for who/what touched customer data
- [ ] You have a basic incident response plan (who gets notified, what happens, if data is exposed)

If any of these aren't true yet, fix them before submitting the declaration — this is Shopify's actual bar for Level 2, not just a form to check through.

**Alternative if you want to avoid this step entirely:** drop `firstName`, `lastName`, and `email` from the customer/order GraphQL queries and rely on `id` / `numberOfOrders` / `amountSpent` only. That drops the app out of Level 2 and this whole approval path — but the developer confirmed name/email are genuinely needed for how the agent answers, so this isn't the current plan.

## 2. Category

**Store management → Operations**, tag: Automation/task management (per your confirmation). The approve-before-execute action workflow (price, inventory, discount, tag changes) is the core mechanism — that's an operations tool, not primarily an analytics dashboard, even though it also answers questions from store data.

## 3. Pricing (already implemented — do not deviate in the listing)

Single plan, must be listed exactly as coded in [shopify.server.ts](app/shopify.server.ts):

- **Monthly subscription — $19.99 USD / 30 days, 7-day free trial**

## 4. Listing copy

### App name
RAG AI Agent *(must match Partner Dashboard exactly — already renamed and deployed)*

### App card subtitle (≤62 chars)
"Answers from your real store data. You approve every change."
*(62 chars incl. spaces — trim to "Grounded store answers. You approve every change." if it needs to shrink further)*

### App introduction (≤100 chars)
"An AI agent that answers from your real store data and asks before it changes anything."
*(87 chars)*

### App details (≤500 chars)
"RAG AI Agent answers questions using your store's live products, orders, inventory, customers, and discounts, plus any documents you upload. Ask what's low on stock or how a discount is performing and get answers grounded in real data. When you request a change like a price or inventory update, the agent prepares it and waits for your approval before anything executes. Bring your own Anthropic API key for full model control."
*(427 chars)*

### Longer-form description (for your own reference / any free-text sections Shopify's form allows beyond the 500-char App details field)
RAG AI Agent is an embedded assistant that answers your questions using your store's own live data — products, orders, inventory, customers, and discounts — plus any documents you upload to its knowledge base. Ask it what's low on stock, which products haven't sold recently, or how a discount is performing, and get an answer grounded in what's actually in your store.

When you ask for a change — a price update, an inventory adjustment, a discount status, an order tag — the agent prepares the exact action and explains it. Nothing executes until you review and approve it. Every approved action is logged and idempotent, so nothing runs twice.

Connect Google Drive or upload PDFs and documents to extend what the agent knows beyond your Shopify data, and bring your own Anthropic API key if you want full control over which model runs your requests.

### Features (grounded in actual code — expand as needed, max 25)
Each entry is a short **title** (≤80 chars, all well under that here) plus a one-sentence description in Shopify's separate description field.

1. **Store-grounded Q&A** — Answers pulled from live products, orders, inventory, customers, and discounts, not generic AI guesses.
2. **Approve-before-execute actions** — Every proposed price, inventory, discount, or order-tag change requires your explicit approval before it runs.
3. **Price updates** — The agent can prepare product/variant price changes for your approval. (`update-price.server.ts`)
4. **Inventory adjustments** — Prepares inventory-level changes across locations for your approval. (`update-inventory.server.ts`)
5. **Discount status changes** — Prepares enabling/disabling a discount for your approval. (`update-discount-status.server.ts`)
6. **Order tagging** — Prepares adding tags to orders for your approval. (`add-order-tags.server.ts`)
7. **Pending approvals queue** — A dedicated Activity view lists every action waiting on your decision, plus full history of past approvals/rejections.
8. **Impact and usage summaries** — Activity page surfaces the measured impact of executed actions and overall usage at a glance.
9. **Insight log** — The agent records standout findings (not just answers) that you can revisit later, not only in the moment they were asked.
10. **Downloadable CSV reports** — Turn a tabular chat answer into a downloadable CSV file. (`app/lib/reports/csv.server.ts`)
11. **Save reports to Google Drive** — Send a generated CSV report straight to your connected Drive instead of downloading it manually.
12. **Document knowledge base** — Upload PDFs, Word docs, or text files to extend what the agent can answer.
13. **Google Drive integration** — Connect Drive so its documents feed the same knowledge base.
14. **Query intent routing** — Classifies each question and retrieves from the right mix of structured data, semantic memory, and recent activity.
15. **Outcome-based learning** — Tracks the results of executed actions per shop and tool to calibrate future recommendations.
16. **Bring your own AI key** — Optionally use your own Anthropic or OpenAI key and choose your chat/classifier model.

### Key benefits (max 3)
1. Get accurate answers about your store without digging through admin screens or reports.
2. Delegate routine store changes without losing control — you approve every one.
3. Extend the agent's knowledge with your own documents, not just Shopify data.

### Search terms (5, distinct concepts)
1. store assistant
2. inventory recommendations
3. pricing automation
4. knowledge base
5. store insights

*(Avoided: the app's own name, generic single words like "AI"/"Shopify", and any third-party vendor names like "Anthropic"/"Claude" — those may not be allowed as search terms.)*

### Title tag (SEO, ~50–60 chars)
"RAG AI Agent — AI Store Assistant for Shopify"

### Meta description (SEO, ~150–160 chars)
"An AI assistant for Shopify that answers questions from your real store data and proposes store changes you approve before anything runs."

### Pricing details field
"$19.99/month, billed every 30 days. 7-day free trial. Cancel anytime from Shopify billing."

## 5. What you still need to decide/write yourself

- Trim/adjust the subtitle and copy above to your actual voice — this is a first draft, not final copy.
- Confirm the exact wording Shopify's submission form wants per field (character limits are enforced live in their form) — the App introduction (100 char) and App details (500 char) limits above were confirmed via search against third-party sources, not Shopify's live form; re-verify against the actual submission page since Shopify has changed these before.

## 6. Reviewer / instruction notes (draft — fill in the bracketed parts)

```
1. Install the app on the provided test store. You'll land on the plan
   screen — approving the subscription triggers a TEST charge only
   (isTest is wired to NODE_ENV, and this store is a development store,
   so no real payment occurs).

2. REQUIRED SETUP: Before asking the agent anything, go to Settings and
   enter an Anthropic API key (the app has no default key configured —
   without one, questions and recommendations will fail). Test key:
   [PROVIDE A WORKING TEST KEY HERE — do not leave blank, this is a
   guaranteed rejection reason]. An OpenAI key is also needed for
   document/knowledge-base embedding features — test key:
   [PROVIDE HERE].

3. On first install, the app runs an initial sync of your store's
   products, orders, customers, inventory, and discounts. This can take
   a few minutes on larger stores; the test store is small so it should
   finish quickly.

4. Go to Home and ask a question like "what's low on stock?" or "which
   products haven't sold recently?" — the answer should reference real
   data from the test store.

5. Ask for a change, e.g. "lower the price of [product] by 10%." The
   agent will PREPARE the action and ask for approval — nothing executes
   until you click approve. Approve it and confirm the change applied.

6. Documents: go to Documents and upload a PDF or text file to see it
   added to the knowledge base.

7. The app does not modify your theme, checkout, or storefront in any
   way — all functionality is Admin-API-only, confined to the embedded
   admin UI.
```

## 7. Pre-submission checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (if configured)
- [ ] `npm run build` succeeds
- [ ] Set `ANTHROPIC_API_KEY` (and `OPENAI_API_KEY`) on the production deploy, **or** finalize the reviewer-must-enter-key instructions above with real working keys
- [ ] Billing plan in code ($19.99/mo, 7-day trial) matches what you enter in the Partner Dashboard pricing section exactly
- [ ] Privacy policy + terms linked from Settings (verify an in-app link exists, not just the routes)
- [ ] Trigger each GDPR webhook once via `shopify app webhook trigger` to confirm they respond correctly
- [ ] Set emergency developer contact in Partner Dashboard (recommended: rebucasrandy1986@gmail.com)
- [ ] Take unique screenshots of real UI (Home, an approval flow, Documents, Settings) — no stats/testimonials baked into images
- [ ] Record a narrated demo screencast walking through install → question → approval flow
- [ ] Confirm `NODE_ENV=production` is actually set on the Vercel production deployment (billing enforcement and `isTest` both depend on this)
- [ ] State explicitly in the listing that neither Online Store nor POS is required
