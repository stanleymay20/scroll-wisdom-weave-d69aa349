---
name: Author Revenue OS
description: Universal creator commerce architecture (creator_assets → purchases → entitlements → ledger). M1 shipped; M2-M8 staged.
type: feature
---

ScrollLibrary evolved from book marketplace into Author Revenue OS using a single polymorphic commerce stack. Do not create parallel checkout, payout, entitlement, or marketplace systems.

## Core tables (M1, shipped)
- `creator_assets` — polymorphic product (book/audiobook/workbook/template/prompt_pack/research_pack/checklist/guide/course/coaching/consulting/community/membership/service/bundle). Status: draft|review|live|paused|archived. `source_book_id` links book-assets back to `books` (1:1, unique).
- `creator_asset_files` — digital deliverables.
- `purchases` — universal purchase ledger. Pricing models: one_time|subscription|booking. `parent_purchase_id` links bundle children. `source_book_purchase_id` links backfilled rows.
- `creator_business_events` — milestone stream (asset_created/published/paused, first_sale, nth_sale, etc.). NOT emitted for backfilled historical rows.
- `public_listings.asset_id` — nullable FK pointing at the asset graph.

## Universal access RPC
`get_user_asset_entitlements(_user_id)` returns `(asset_id, asset_type, source, expires_at, purchase_id)`. Sources: creator_owned, purchase, subscription, book_purchase (legacy). Every future access gate (downloads, reader, coaching, community, member content) must go through this RPC.

## Staged ledger migration (critical)
- **M1**: backfill only. `book_purchases` is system of record. `purchases` is abstraction.
- **M2**: dual-write — new book checkouts write to both `book_purchases` AND `purchases`. Non-book assets write only to `purchases`. New `record_asset_purchase_ledger` writes non-book rows into existing `creator_earnings_ledger`.
- **M8**: validation window, then ledger reads exclusively from `purchases`. Never hard-cutover the ledger.

## Milestone order (final)
M1 asset graph + universal purchases + entitlement RPC + business events (DONE)
M2 polymorphic checkout + dual-write for books
M3 digital products UI (`/creator/assets`)
M4 services + coaching (`creator_asset_bookings`, email confirm, no calendar integrations)
M5 memberships (`creator_memberships`, `creator_membership_benefits`)
M6 bundles (`creator_bundles`, parent/child purchase rows)
M7 creator storefront + offer stack (`display_order`, `funnel_role`)
M8 ledger cutover

## Business Health Score (later)
`get_creator_business_health` — weights from `platform_config` (no hardcoding). 7 dims: Audience, Sales, Conversion, Retention, Reviews, Revenue Diversity, **Momentum** (30d/90d growth + repeat trend).

## Non-goals
No calendar/Zoom integrations. No new checkout function per asset type. No new payout pipeline. No hardcoded weights. No premature dormant tables.
