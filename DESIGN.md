# Design

<!-- impeccable:design-schema 1 -->

## World

Retail price-tag / tag-gun ticket system. The marketing landing page ([app/routes/_index/route.tsx](app/routes/_index/route.tsx)) reads as a corkboard/pegboard hung with manila and kraft price tags and tickets — the physical vocabulary of a Shopify merchant's own back room, not a generic AI-SaaS chat-bubble page. Every claim is a tag; the approval workflow is a rubber "APPROVED" stamp; the login form is a "claim ticket" you fill out and redeem.

## Palette

- `--board` / `--board-dark` (#6b5642 / #4f3f2f): striped pegboard ground, page background.
- `--manila` (#e8d9b0) and `--cream` (#f4ecd8): tag/ticket stock.
- `--kraft` / `--kraft-dark` (#c9a876 / #a8875a): reserved accent tokens for future kraft-stock elements.
- `--red` / `--red-dark` (#b6402f / #8f2e21): sale-ticket red — CTA, accent headline word, stamp, "you must approve" emphasis.
- `--ink` / `--ink-soft` (#2b241a / #4a4030): primary/secondary text on tag stock.
- `--thread` (#d8cbaa): string/perforation details on the dark board ground.

Color strategy: Committed — the striped board ground and manila/red tag stock carry the whole page; no neutral SaaS-gray base.

## Type

- Display: **Anton** (condensed poster/stencil face) — all headings, section titles, numerals, stamp-adjacent labels. Matches gun-embossed ticket lettering.
- Body/data: **JetBrains Mono** — running copy, table data, form fields. Reads as ticket printing / register tape.
- Accent: **Permanent Marker** — used once, for the hand-stamped "APPROVED" mark only. Not a body or heading face.

Loaded via Google Fonts in [app/routes/_index/route.tsx](app/routes/_index/route.tsx)'s `links` export, scoped to this route only.

## Components

- **Ticket/tag card** (`.heroTicket`, `.claimTicket`, `.factTag`, `.howTag`): manila or red card, slight rotation (1.5–2°), string-and-punch-hole detail (`.punch`) or small punch dot (`.punchSmall`), soft offset shadow. This is the page's one component family — every content block is a variant of it.
- **Perforation rule** (`.perf`): dashed tear-line with circular "hole" cutouts at each end, used to separate a ticket's stub.
- **Stamp** (`.stamp`): Permanent Marker mark in a rotated bordered box, red ink — the approval moment.
- **Manifest table** (`.ledger`): dark header row, cream body, monospace data — the one place tabular/ledger material appears.
- **Receipt footer** (`.receipt`): centered, dotted-rule divider, tracked caps — closes the page like a register tape tear-off.

## Layout

Single-column vertical flow: header → hero (ticket + scattered fact tags) → three-tag "how it works" row → manifest table → claim-ticket login form → receipt footer. Cards rotate slightly off-axis in the hero and how-it-works row to read as physically pinned/hung rather than gridded; the manifest table and claim ticket sit flat since they're meant to read as filled-out paperwork, not pinned ephemera.

## Responsive rules

Below 68rem: hero collapses to one column, scattered fact tags un-rotate and stack in a flex row, the three-tag row stacks vertically, table scrolls horizontally. Below 30rem: padding tightens, hero ticket's rotation reduces to 1° so it doesn't overflow narrow viewports.

## Motion

Minimal by design — the tag/paper world's "motion" is implied physicality (rotation, shadow, string), not animated effects. Only interactive motion: button hover lifts 1px with a color shift (`.button:hover`).

## Provenance

Built via `/impeccable` new-work flow, direction roll assigned index 6 of 7 grounded candidates (seed key `fda3c1c4`, mode `persuade`) against PRODUCT.md. No headless browser was available in this environment for the screenshot-based finish-review round or the shipped finish-reviewer/documenter subagents (not present in this harness's agent roster); this file was written in-thread as the disclosed substitute, and a static standalone preview (`rag-ai-agent-landing-preview.html`) was generated and sent to the user in place of screenshots for visual verification. Detector pass (`detect.mjs`) is clean; TypeScript typecheck is clean. A real browser-based finish review is recommended before this ships.
