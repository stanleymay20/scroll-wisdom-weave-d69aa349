# Phase 2.1 — Evidence & Citation Engine + Publisher Design System

Two slices shipped together so the next exported PDF gains both **trust** (verifiable sources) and **professional appearance** (publisher-grade typography). Everything is additive — existing books, reader, editor, library, and exports keep working unchanged.

---

## Slice A — Evidence & Citation Engine

### Goal
Turn `book_citations` into a first-class evidence ledger covering 10 source types, with structured fields, an in-app manager, an inline `[cite:key]` renderer, and an auto-generated References section in every export.

### Source types supported
`journal_article`, `book`, `government_report`, `company_report`, `white_paper`, `news_article`, `standard`, `regulation`, `website`, `dataset`

### Data model (additive migration)
Extend `book_citations` with:
- `source_type` (enum, default `journal_article`) — already had `type`, normalize via migration
- `authors jsonb` — `[{ family, given, orcid? }]`
- `publisher text`, `container_title text` (journal/site/agency name)
- `volume text`, `issue text`, `pages text`
- `doi text`, `isbn text`, `url text`, `accessed_at date`
- `confidence` (enum: `verified`, `unverified`, `requires_review`, default `unverified`)
- `citation_key text` — short stable handle authors type inline (e.g. `kahneman1979`)
- `notes text`
- Unique `(book_id, citation_key)`; GRANTs + RLS preserved (author-only write, public read on published books)

Backfill: populate `source_type` from existing `type`, derive `citation_key` from first author + year.

### Edge functions
- `upsert-citation` — author-scoped write, validates DOI/ISBN format, dedupes by DOI or `(authors+year+title)`.
- `import-citations` — paste BibTeX / RIS / CSL-JSON, batch-validate, return preview before commit.
- `verify-citation` — optional DOI/Crossref + ISBN/OpenLibrary lookup to flip `confidence → verified`.
- `generate-references` (already exists) — refactor to **read from `book_citations` first**, only call Perplexity when the author opts into "suggest missing sources".

### Frontend
- `src/components/citations/CitationManager.tsx` — table of citations per book, add/edit/import, confidence chips, DOI verify button.
- `src/components/citations/CitationPicker.tsx` — slash-command in the editor (`/cite`) inserts `[cite:key]`.
- `src/lib/citationRender.tsx` — replaces `[cite:key]` in chapter content with a numbered superscript link; hover shows full APA/Chicago/Harvard/IEEE preview (style chosen per book).
- Reader: footnote drawer lists all cited sources on the current page.

### Export integration
- `export-publication` resolves citations from the **Publication snapshot** (never request payload), formats them in the book's chosen style, and emits a "References" section at the end (plus per-chapter endnotes if the author enables it).

### Acceptance gate (Slice A)
- Existing chapters render unchanged when they contain no `[cite:...]` markers.
- Adding a citation never mutates other books.
- References section appears in PDF exports with correct numbering.
- Unverified citations are visually flagged in the Manager (no flag leaks to readers).
- Non-authors cannot write to `book_citations`.

---

## Slice B — Publisher Design System

### Goal
A single typography + layout system that every export consumes, so PDFs look like they came from a real publisher instead of a generic generator.

### Design tokens (`supabase/functions/_shared/publisherDesign.ts`)
Shared by all current/future export functions:
- **Type scale**: display serif (titles), text serif (body), sans (UI/captions). Default pairing: *Spectral* + *Inter*. Authors can pick from 3 curated pairings (Editorial, Academic, Modern).
- **Page master**: US Letter + A5 + 6×9 trim, mirrored inner/outer margins, baseline grid (14pt).
- **Spacing scale**: 4/8/12/16/24/32/48.
- **Color**: ink `#111`, rule `#999`, accent (per-book), muted `#666` — all token-driven.

### Page elements (rendered by `export-publication`)
- Chapter opener: drop folio, oversized chapter number, rule, epigraph slot.
- Running header: book title (verso) / chapter title (recto); suppressed on chapter openers.
- Running footer: page number centered or outer-aligned.
- Pull quote, callout box, key-takeaway box, executive-summary block — all parsed from markdown directives:
  - `> [!pullquote] …`
  - `> [!callout] …`
  - `> [!key] …`
  - `> [!summary] …`
- Figure + table styling: numbered captions ("Figure 3.2 — …"), consistent rule weights, auto-fit to text width.
- Widow/orphan control: minimum 2 lines at top/bottom; heading + next paragraph kept together.
- Heading hierarchy: H1 (chapter), H2 (section), H3 (subsection) only — H4+ rendered as run-in bold.

### Frontend
- `src/components/publish/DesignSystemPanel.tsx` — author picks pairing, trim size, accent color, running-header style. Live preview thumbnail.
- Persisted on `books.design_settings jsonb` (additive column, default = "Editorial").
- Snapshot copied into Publication on publish (immutable after).

### Export integration
- `export-publication` and the existing `generate-publication-certificate` share `_shared/publisherDesign.ts` so the certificate already proves the typography stack (Phase 2 Slice 0 → 2.1 continuity).
- New `_shared/pdfBlocks.ts` with reusable renderers: `drawChapterOpener`, `drawRunningHeader`, `drawCallout`, `drawPullQuote`, `drawFigure`, `drawTable`, `drawReferences`.

### Acceptance gate (Slice B)
- Books with no design settings fall back to "Editorial" defaults — no migration required for existing books.
- Chapter openers, headers, footers, and page numbers appear in every PDF export.
- Pull quotes / callouts render distinctly from body text.
- No widow/orphan in a 50-page smoke test export.
- Design settings on Publication snapshot are immutable (write attempts after publish are rejected by the existing authorship guard).

---

## Out of scope for Phase 2.1 (TODO markers only)
- Figure/table generation engine → Phase 2.2
- Asset provenance + citation freezing → Phase 2.3
- PDF/A, EPUB 3, Kindle, print-ready, a11y compliance → Phase 2.4
- Publication Readiness Score → Phase 2.5
- Domain event bus, export provider registry, asymmetric signatures, org inheritance, work lineage UI → carried from Phase 1 backlog

---

## Files to create / edit (high level)

**Migrations**
- `book_citations` schema extension + backfill
- `books.design_settings jsonb`
- `publications.design_snapshot jsonb` (immutable)

**Edge functions**
- new: `upsert-citation`, `import-citations`, `verify-citation`
- refactored: `generate-references`, `export-publication`, `generate-publication-certificate`
- new shared: `_shared/publisherDesign.ts`, `_shared/pdfBlocks.ts`, `_shared/citationFormat.ts`

**Frontend**
- new: `src/components/citations/{CitationManager,CitationPicker}.tsx`
- new: `src/components/publish/DesignSystemPanel.tsx`
- new: `src/lib/citationRender.tsx`, `src/lib/citationStyles.ts`
- edit: editor surface (slash menu), reader (footnote drawer), `PublishingCommandCenter` (mount the two new panels)

---

## Ship order
1. Migrations + shared modules (`publisherDesign`, `pdfBlocks`, `citationFormat`).
2. Citation Manager + Picker + inline renderer (reader works end-to-end).
3. Design System Panel + Publication snapshot.
4. Wire `export-publication` to consume both; regenerate certificate using shared design tokens.
5. Smoke-test export of an existing book → diff against pre-2.1 PDF for regression.

Reply **"Approved — ship Phase 2.1"** and I'll start with the migrations and shared modules.
