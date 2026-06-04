## Phase 5 — Creator Business Hub & Knowledge Commerce Platform

This is a multi-month platform evolution. I'll break it into shippable milestones and propose we tackle them in order. Approve the plan, then we ship M1 first.

---

### Milestone 1 — Creator Business Hub (foundation)
New route `/creator/business` as the creator command center, reusing existing analytics where possible.

Sections (v1):
- **Revenue** — lifetime, MRR, by book, by channel, by country, by product type, growth trend, top assets.
- **Audience** — followers, email subscribers, returning readers, active learners, certification completions, conversion funnel.
- **Sales** — storefront conversion, checkout conversion, cart abandonment, sample→purchase, RPV, RPF.
- **Distribution** — per-channel sales (ScrollLibrary, Shopify, Gumroad, Etsy, Patreon, Substack, external).
- **Creator Intelligence** — AI recommendations (topics, pricing, promotion, audience, gaps, upsells) — wraps existing `creatorIntelligence` RPCs + new Lovable AI synthesis edge function.

Backend:
- New SECURITY DEFINER RPCs: `get_creator_revenue_summary`, `get_creator_audience_summary`, `get_creator_sales_funnel`, `get_creator_distribution_breakdown`.
- New edge function `creator-intelligence-synthesis` (Lovable AI, gemini-2.5-flash) that turns the metrics into 5–8 actionable recommendations.

### Milestone 2 — Knowledge Commerce Layer (product types)
Extend listings beyond books to support: **courses, certifications (paid), workbooks, research reports, coaching, memberships, bundles**.

- New table `creator_products` (polymorphic: book | course | certification | workbook | report | coaching | membership | bundle) with `product_type`, `pricing_model` (one_time | subscription | tiered), `stripe_price_id`, `metadata jsonb`.
- New table `product_bundle_items` for bundles.
- Extend storefront + checkout edge functions to handle non-book product types.
- Creator UI: `/creator/products` to create/edit each product type.
- Reuse existing certificate engine for paid certifications (gate behind `purchase_intents`).

### Milestone 3 — Customer Ownership Layer (CRM + email)
- `creator_subscribers` (email, source, consent, tags, segments).
- `creator_customer_profiles` view joining purchases + reading + certifications + follows per creator.
- `/creator/audience` page: subscribers list, CRM detail drawer, segmentation builder (saved filters).
- Export CSV via edge function `export-creator-audience`.
- Newsletter sending via Lovable Emails (`send-creator-newsletter` queues to `transactional_emails`).

### Milestone 4 — Monetization Model (Creator subscriptions + marketplace commission)
- Extend `creator_entitlements` with new tiers: **Creator (€19/mo)** and **Creator Pro (€49/mo)** (Stripe products).
- Marketplace commission: configurable `platform_fee_bps` on `creator_products` sales, recorded in `financial_events`.
- Update `RequiresCreator` / `RequiresCreatorPro` gates already partially present.
- AdminOps: surface MRR, GMV, take rate, creator upgrade funnel.

### Milestone 5 — Positioning + Journey UX
- Rewrite marketing/home copy: "The Creator Economy Platform for Knowledge."
- New `/for-creators` landing page showing the Expert → Revenue journey.
- Update onboarding to surface the creator path.

### Milestone 6 — Success Metrics dashboard (internal)
- Extend `/admin/ops` with: active creators, creator revenue, creator retention, upgrades, GMV, MRR, AOV, course completions, certifications earned, learner retention.

---

### Technical notes
- All new tables: `GRANT` + RLS + `has_role` for admin views, `auth.uid()` for creator scope.
- Reuse: `creatorIntelligence.ts`, `useCreatorEntitlements`, `publishing_audit_log`, `financial_events`, `storefront-api`, `purchase_intents`, `external_publications`.
- AI: Lovable AI gateway, `gemini-2.5-flash` for recommendations.
- Payments: extend existing seamless Stripe (`create-book-checkout` → generalize to `create-product-checkout`).
- No Google OAuth (per project policy). Email/Password + Magic Link only.

---

### Proposed shipping order
1. **M1 Creator Business Hub** — biggest single perceived value, mostly read-only over existing data. ~1 large turn.
2. **M2 Knowledge Commerce** — unlocks the rest. ~2 turns (schema + checkout, then UI).
3. **M3 Customer Ownership** — ~2 turns.
4. **M4 Monetization tiers** — ~1 turn (Stripe products + gates).
5. **M5 Positioning** — ~1 turn.
6. **M6 Internal metrics** — ~1 turn.

Reply **"Start M1"** to ship the Creator Business Hub now, or tell me to re-order / cut scope.
