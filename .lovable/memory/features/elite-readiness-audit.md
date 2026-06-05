---
name: Elite Readiness Audit
description: Single SQL scorer (get_book_elite_readiness / get_marketplace_elite_readiness) computing 4-tier marketplace quality from live tables. Authors see /book/:bookId/publishing panel, admins see AdminOps Catalog Quality tab. Reviews/ratings never gate Elite.
type: feature
---

Single source of truth for "Elite" marketplace quality. Always extend the RPC — never fork the scoring logic into client code or a separate counter table.

## RPCs
- `public.compute_book_elite_readiness(book_id)` — internal scorer, `service_role` only.
- `public.get_book_elite_readiness(book_id)` — author or admin wrapper.
- `public.get_marketplace_elite_readiness(limit, offset, tier)` — admin sweep, scores every public listing on the fly.

## Tiers
- `draft` — required publish fields missing (cover, ≥5 chapters, no empty chapters). Cannot publish.
- `needs_work` — composite < 0.65. Publish allowed but warned.
- `ready` — composite ≥ 0.65, no publish blockers. Publishable and good. No export required.
- `elite` — composite ≥ 0.85 AND zero hard blockers. Premium badge. Recent export REQUIRED for this tier only.

## Dimensions (weights)
- Preflight 30% — cover, subtitle, blurb ≥120, amazon_description ≥200, ≥3 sample chapters, price set for paid, chapters complete + audited.
- Reading 30% — latest `book_audits.overall_score ≥ 0.85` + `certification_eligible`; knowledge-graph density `nodes ≥ max(5, ceil(total_words/2000))`.
- Export 15% — ≥1 completed export within 30 days; ≥2 bundle types is bonus. Only gates Elite.
- Catalog 15% — no open content_reports or citation_flags; listing is public. Reviews/rating do NOT gate Elite (they feed marketplace trust elsewhere).
- Discoverability 10% — title, description ≥120, ≥3 SEO keywords, non-default category, language, complete author profile (display_name + bio).

## Graph density
Threshold scales with length: `required_nodes = max(5, ceil(total_words / 2000))`. Poetry/novellas/children's books are not punished.

## UI surfaces
- `src/components/publish/EliteReadinessPanel.tsx` — mounted at top of `BookPublishSettings` (`/book/:bookId/publishing`).
- `src/components/admin/AdminCatalogQualityTab.tsx` — registered as "Catalog Quality" tab in `AdminOps`.

## Future extensions
Add new checks by editing `compute_book_elite_readiness` and bumping the dimension's `*_total`. Never compute scores in client code.
