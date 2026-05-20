# Phase 1 (Revised) — Publishing Infrastructure + Storefront + Export Bundles

Edits incorporated: Author Profiles, Series Support, Export Queueing, Analytics, hardened purchase_intents, AI metadata suggestions, license_type, KDP naming.

## Schema (single migration)

### `author_profiles`
- `user_id` (PK, FK to auth), `slug` unique, `display_name`, `bio`, `avatar_url`, `website_url`, `linkedin_url`, `x_url`, `created_at`, `updated_at`
- RLS: public SELECT all; owner UPDATE/INSERT own row

### `book_series`
- `id`, `user_id`, `slug` unique, `title`, `description`, `cover_image_url`, `created_at`
- RLS: public SELECT; owner ALL on own

### `public_listings`
- `id`, `book_id` FK unique, `slug` unique, `is_public` bool, `price_cents` int default 0, `currency` default 'usd', `sample_chapters` int default 1, `blurb`, `seo_keywords` text[], `seo_categories` text[], `subtitle`, `amazon_description`, `backend_keywords` text[], `license_type` enum-text default 'personal' (allowed: personal/commercial/educational/institutional/resale), `series_id` FK nullable, `series_order` int nullable, `cover_override_url`, `created_at`, `updated_at`
- RLS: public SELECT where `is_public=true`; owner ALL via books.user_id

### `purchase_intents` (hardened — edge-mediated only)
- `id`, `listing_id` FK, `buyer_email`, `buyer_ip`, `source` text check in ('storefront','kdp','gumroad','linkedin'), `metadata` jsonb, `created_at`
- RLS: NO public insert. Insert only via SECURITY DEFINER edge function (`record-purchase-intent`) which does simple per-IP throttle (in-memory + DB count last 60s). SELECT owner-only via listing→book.

### `storefront_events` (analytics)
- `id`, `listing_id`, `event_type` text (sample_open, sample_complete, cta_click, kdp_export_started, kdp_export_completed, gumroad_export_started, gumroad_export_completed, share_click, buy_click), `user_id` nullable, `session_id`, `metadata` jsonb, `created_at`
- RLS: public INSERT (anon-safe, no PII); owner SELECT via listing→book; admin SELECT all

### `export_jobs` (queue, mirrors generation_jobs pattern)
- `id`, `user_id`, `book_id`, `listing_id` nullable, `bundle_type` ('kdp','gumroad'), `status` ('pending','running','completed','failed'), `progress` int 0–100, `result_url` text (signed Storage URL), `result_expires_at`, `error_message`, `error_code`, `metadata` jsonb (trim_size, license, buyer_email…), `started_at`, `completed_at`, `created_at`, `updated_at`
- RLS: owner ALL

## Edge Functions

1. **`record-purchase-intent`** — validate body (Zod), throttle per-IP (10/min), insert intent, return ok. Logs `buy_click` storefront_event.
2. **`suggest-publishing-metadata`** — input: bookId. Uses `google/gemini-2.5-flash` via Lovable AI to return `{subtitle, amazon_description, keywords[7], categories[2], backend_keywords[7]}`. Authenticated, owner-only.
3. **`enqueue-export-bundle`** — input: `{ bookId, bundleType, options }`. Creates `export_jobs` row (status=pending), kicks the worker via `EdgeRuntime.waitUntil(runExport(jobId))`. Returns `{ jobId }`.
4. **`run-export-bundle`** (internal, invoked by enqueue via waitUntil) — does the heavy lift:
   - Fetches book + chapters + cover
   - KDP: 6×9 print PDF (pdf-lib), composite front/back/spine cover, EPUB (reuse existing), `metadata.txt` (KDP-ready), bundles ZIP (jszip)
   - Gumroad: watermarked PDF, sample PDF (first N chapters), license PDF, social PNG (1200×630), bundles ZIP
   - Uploads ZIP to `exports` storage bucket (private) at `{user_id}/{book_id}/{job_id}.zip`
   - Updates job: `result_url` (signed 7-day), `status=completed`, `progress=100`
   - On failure: status=failed, error_code/message
5. **`log-storefront-event`** — accepts anon, validates event_type, inserts row. No PII enforcement client-side.

## Frontend

### Routes (App.tsx additions)
- `/library` → `Storefront.tsx` (public index, search, category filter, series shelves)
- `/library/:slug` → `PublicBookPage.tsx` (SEO Helmet, CTAs, sample preview)
- `/library/:slug/read` → `PublicSampleReader.tsx` (sample chapters + paywall)
- `/authors/:slug` → `AuthorProfilePage.tsx` (bio + book grid)
- `/series/:slug` → `SeriesPage.tsx`
- `/book/:bookId/publish` → `BookPublishSettings.tsx` (owner: toggle public, slug, price, sample count, blurb, license, AI-suggest metadata button, series picker)
- `/account/author` → `AuthorProfileEditor.tsx`
- `/account/exports` → `ExportJobsPage.tsx` (queue status + download links)

### Components
- `storefront/CTABar.tsx` — Read Sample / Buy / Publish Bundle for Amazon KDP / Download EPUB / Share
- `storefront/PublishBundleDialog.tsx` (KDP) — trim size, gutter, license, "Generate Bundle" → enqueue → poll job
- `storefront/GumroadBundleDialog.tsx`
- `storefront/AISuggestMetadata.tsx` — button in publish settings, calls suggest-publishing-metadata
- `storefront/ListingSEO.tsx` — Helmet wrapper emitting Book JSON-LD, canonical, og:image
- `storefront/PaywallGate.tsx` — sample limit gate in reader

### Analytics hook
- `src/lib/storefrontAnalytics.ts` — `trackStorefrontEvent(listingId, eventType, metadata)` wraps supabase.functions.invoke('log-storefront-event'). Fire on mount/click for sample_open, cta_click, buy_click, share_click. Worker fires *_export_started/_completed.

### Reuse
- Existing PDF/EPUB export logic is imported by `run-export-bundle` (no rebuild). Cover already exists. Reader is rendered read-only with `maxChapter={sample_chapters}` prop on PublicSampleReader.

## SEO
- HelmetProvider already used elsewhere (verify); add Book JSON-LD on `/library/:slug`, BreadcrumbList on series/author pages, canonical `https://scrolllibrary.org/library/{slug}`.

## Storage
- New private bucket `exports` with policy: owner SELECT via `(storage.foldername(name))[1] = auth.uid()::text`. Signed URLs only.

## Build Order
1. Migration (all tables + RLS + storage bucket + policies)
2. Author profile editor + public author page
3. Publish settings page (with AI metadata suggest)
4. Public storefront index + book page + sample reader
5. Export queue + KDP edge fn + UI dialog + jobs page
6. Gumroad edge fn + UI dialog
7. Purchase intent stub (edge-mediated)
8. Analytics wiring across surfaces
9. QA: end-to-end publish → view → sample → enqueue KDP → download ZIP

## Out of Scope (next phases)
- Real Stripe checkout
- LinkedIn share cards
- Reviews system
- ISBN purchase
- Dynamic sitemap regeneration
- Real CAPTCHA on purchase_intents

Approving this kicks off step 1 (migration). Confirm and I'll start.

---

# Phase 3+ — Export-First Publishing & Distribution Roadmap

Strategic direction: ScrollLibrary evolves into "the operating system for AI-native publishing." Export-first now, direct integrations later. Never automate KDP publishing directly (Amazon AI-content scrutiny + account risk).

## Model A — Export & Sell Elsewhere (current + near-term)
User generates → ScrollLibrary exports bundle → user manually uploads.
- KDP bundle (print PDF + EPUB + metadata.txt) ✅ Phase 1
- Gumroad bundle (watermarked PDF + sample + license + social PNG) ✅ Phase 1
- Etsy bundle (printable PDFs, planners, study packs) — Phase 3
- Substack assets (chapter-as-newsletter HTML + cover crops) — Phase 3
- Patreon content pack (tiered downloads, serialized chapters) — Phase 3

Safer, simpler, lower compliance risk. Correct first step.

## Phase 3 — Reduce Creator Friction (no OAuth yet)
- One-click metadata copy (titles, descriptions, hashtags) per destination
- Auto-generated thumbnails sized per platform (KDP 1.6:1, Substack 1200×630, Patreon 1280×720, Etsy 2000×2000, Gumroad 600×900)
- SEO descriptions tuned per destination
- Social asset pack (Twitter/X, LinkedIn, Instagram square + story)
- "Publishing Wizard" checklist per destination with copy-paste fields

## Phase 4 — Direct OAuth Integrations (Model B, selective)
Priority order based on feasibility + strategic alignment:

1. **Gumroad** — API mature. Auto-create products, upload PDFs, set pricing, sync updates. Highest near-term ROI.
2. **Patreon** — Auto-create member-only posts, release serialized chapters, push premium downloads. Enables "AI-generated subscription publishing."
3. **Substack** — Convert books → newsletters, serialize chapters, AI-assisted long-form. Strong alignment with AtlasResearch + educational publishing vision.
4. **Etsy** — Lower priority. Good for templates/planners/printables. Less aligned with infrastructure thesis.
5. **KDP** — DO NOT automate direct publishing. Export-only forever (or assisted wizard with metadata sync, far future).

## Phase 5 — Creator Operating System (long-term)
Creator dashboard surfaces across destinations:
- Revenue (per platform + aggregate via Creator Earnings Ledger from Phase 2)
- Analytics (sales, conversion, audience growth)
- Subscribers (Patreon + Substack)
- Royalties (KDP imported / Gumroad direct)
- Publishing destinations health + sync status
- Audience growth (cross-platform funnel)

End state: "part Canva, part Gumroad, part Kindle tooling, part Substack, part AI publishing infrastructure."

## Hard Constraints
- KDP: never direct-publish. Export bundles only.
- Every direct integration is per-user OAuth, tokens stored per-user, never workspace-level service accounts.
- Each external publish creates an immutable `external_publications` ledger row (destination, external_id, published_at, status, last_synced_at).
- Revenue from direct integrations flows through Creator Earnings Ledger (Phase 2) for unified analytics.

## Out of Scope (forever or until explicitly revisited)
- Direct Amazon KDP automated publishing
- Owning customer payment relationship on Patreon/Substack (they handle it)
- Print fulfillment / physical inventory
