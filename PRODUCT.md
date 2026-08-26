# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a solo or small-team Shopify merchant — the owner-operator running day-to-day store admin without dedicated ops staff. They know their store but don't have time to dig through admin screens, reports, and order/inventory data every time they need an answer or have to make a change.

## Product Purpose

Rag AI Agent is an embedded Shopify admin app that answers merchant questions and proposes store actions (pricing, inventory, discounts, order tags) grounded in the store's own live data — not a generic chatbot guessing from training data. Every proposed write action goes through an explicit merchant-approval step before it executes; nothing is auto-executed. Success means merchants get correct, store-specific answers fast and can safely delegate routine store changes without losing control over what actually happens.

## Positioning

Two claims that must both land, inseparably: (1) answers and recommendations are grounded in the merchant's real, live store data plus any documents they upload — not generic AI guesswork; (2) the agent never acts unilaterally — every store-changing action is proposed, then requires explicit merchant approval before it executes. The combination ("correct because it's grounded in your data" + "safe because you always approve") is the differentiator against both generic AI chatbots (ungrounded) and full autonomous agents (unsupervised).

## Operating Context

Runs embedded in the Shopify admin. On install, it bulk-syncs and then keeps in sync via webhooks: products, inventory levels, collections, discounts; it also reads orders, customers, and locations. Fulfillment data sync exists in code but is gated pending Shopify's protected-customer-data approval.

The core loop: Observe → Understand → Retrieve → Reason → Recommend → Request Approval → Execute → Measure → Learn → Update Memory. A query intent classifier routes each merchant question, then the context engine retrieves in parallel across structured store data, semantic memory (pgvector), temporal, and analytical sources, and ranks/budgets that into context for the response.

Merchants can also extend the agent's knowledge by uploading documents (PDF, DOCX, text) or connecting Google Drive — these are chunked and embedded into the same memory store the agent draws on for answers.

Every proposed write action is executed idempotently and only after merchant approval; outcomes are measured afterward and fed back to calibrate the agent's future confidence per shop and per action type.

## Capabilities and Constraints

- Grounded Q&A over live Shopify store data (products, inventory, orders, customers, collections, discounts, locations) plus uploaded documents / connected Google Drive.
- Proposes concrete store actions (e.g. price changes, inventory adjustments, discount status, order tagging); merchant must approve before anything executes — no autonomous writes.
- Self-calibrating: tracks outcomes of executed actions per shop/tool to improve future recommendations.
- Distribution: Shopify App Store listing (public listed app, not custom/unlisted).
- Fulfillment/shipping data integration exists in code but is not yet live — gated on Shopify protected-customer-data approval.

## Brand Commitments

App name is "Rag AI Agent" (Shopify Partner Dashboard name) / "RAG AI Agent" as referred to by the merchant. No existing logo, color system, or visual identity — fully open for this landing page.

## Evidence on Hand

No customer testimonials, case studies, press mentions, or usage benchmarks exist yet — none should be fabricated for the landing page. Concrete, real facts available to use as proof points instead: the specific data sources it syncs (products, inventory, orders, customers, discounts, collections), the explicit approve-before-execute action workflow, and document/Drive-based knowledge upload.

## Product Principles

1. Grounding over guessing: every answer traces back to real store data or merchant-provided documents, never invented.
2. Merchant stays in control: proposals, not unilateral actions — approval is a hard gate, not a formality, and this should read as a safety feature, not friction.
3. Built for the solo operator: value proposition is time saved and confidence gained without needing to hire ops help.
4. Prove it with specifics, not superlatives: since there's no testimonial/benchmark evidence yet, lean on concrete mechanism detail (what data it reads, what it can do, how approval works) rather than vague claims of magic or unverified numbers.

## Pricing

$19.99/month (billed every 30 days), with a 7-day free trial. Single plan.
