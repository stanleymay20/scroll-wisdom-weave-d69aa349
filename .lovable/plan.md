# P0 Typography & Pagination Guard — Phased Build

This is a large engine. To ship safely without breaking the 5,695-line `export-book` function, I'll deliver it in three phases. Phase 1 is the highest-leverage slice (block model + validator + publication gate). Phases 2–3 swap renderers over once the validator is trusted.

## Phase 1 — Block model, validator, publication gate (ship this turn)

Goal: every export is **validated** against the typography rules before download, and Publication Ready is gated on a clean report. The current PDF renderer still runs, but it now feeds the validator and cannot pass certification with blockers.

New module: `supabase/functions/_shared/layout/`

```text
layout/
  blocks.ts          // Semantic block types + factory
  parseBlocks.ts     // Markdown → SemanticBlock[]
  measure.ts         // Deterministic height/width measurement (pt)
  pagination.ts      // Bin-packing with keep-together/keep-with-next
  headingRules.ts
  widowOrphan.ts
  figureRules.ts
  tableRules.ts
  listRules.ts
  keepTogether.ts
  typography.ts      // Tokens: leading, scale, margins, trim sizes
  pageValidator.ts   // Runs all rules → ValidationReport
  publicationGuard.ts// Blocker check + "Publication Ready" verdict
  index.ts           // Public API
```

Mirror under `src/lib/layout/` (re-exports the pure parts) for the UI report.

Block types (all 18 listed in the spec): Chapter, Section, Heading, Paragraph, BulletList, NumberedList, Figure, FigureCaption, Table, TableCaption, Quote, Callout, CodeBlock, Sidebar, Checklist, Glossary, Reference, Appendix. Each exposes: `height`, `width`, `keepTogether`, `keepWithNext`, `pageBreakBefore`, `pageBreakAfter`, `minimumLines`, `maximumSplit`, `priority`.

Rules wired in Phase 1 (all return structured `{ severity, pageNumber, blockId, ruleViolated }`):
- HeadingNotLast, HeadingKeepWithNext (≥3 body lines), ChapterStartsNewPage
- ParagraphWidow / ParagraphOrphan (min 2 lines, configurable)
- FigureAtomic, FigureCaptionAttached
- TableAtomicSmall, TableRepeatHeader, TableNoSplitInRow
- ListAtomicOrSplitBetweenItems, ListHeadingWithFirstItem
- QuoteAtomic, CalloutAtomic, ChecklistHeaderAttached
- GlossaryEntryAtomic, ReferenceEntryAtomic
- ConsistentChapterTopMargin
- PageNumberingMonotonic, RunningHeaderConsistent

Wire-in: `supabase/functions/export-book/index.ts` calls `validatePublication(blocks, pageMap)` right after rendering. If `severity === 'blocker'` and the caller is the `publish-work` certification path (header `x-publication-gate: 1`), the export is rejected with the structured report. Direct downloads still succeed but include `validation_report` in the response so the UI can show warnings.

Publication gate: `supabase/functions/publish-work/index.ts` calls the same validator over the rendered draft *before* minting the certificate. Any blocker → `409 publication_blocked` with the issue list. This is what enforces "Publication Ready".

UI (`src/components/publish/TypographyReport.tsx`): renders the report from `validation_report`. Overall score, grouped by Heading / Paragraph / Figure / Table / Citation / Layout / Typography. Click an issue → opens reader at the offending page/block.

Tests under `supabase/functions/_shared/layout/__tests__/`:
- `headingRules.test.ts`, `widowOrphan.test.ts`, `figureRules.test.ts`, `tableRules.test.ts`, `listRules.test.ts`, `pageValidator.test.ts`, `publicationGuard.test.ts`. Fixtures cover every "Coverage" case in the spec.

## Phase 2 — Layout-driven PDF renderer

Replace the ad-hoc page-flow loop inside `export-book` with a renderer that walks the `Page[]` produced by `pagination.ts`. Same output format, deterministic breaks, no more orphaned headings in practice. Validator becomes a regression net rather than the primary defense.

## Phase 3 — EPUB / DOCX / KDP parity

Reuse the same block tree to drive CSS page-break hints (EPUB), `w:keepNext`/`w:keepLines` (DOCX), and KDP trim-aware pagination. Single source of truth for typography tokens across all four exporters.

## Technical notes

- Measurement is font-metric based (pdf-lib's `widthOfTextAtSize` + leading), so it's deterministic in the Edge runtime — no headless browser.
- Trim sizes and leading come from `publisherDesign.ts` so design presets feed straight into the layout engine.
- The validator is **pure** (blocks + page map in, report out) so it runs identically in edge + browser, which is what lets the UI re-render the same report without a round trip.
- All identity is still pulled from the Publication Snapshot (Phase 1 of the Authorship Guard) — the layout engine never sees client-supplied metadata.
- Phase 1 is additive: no existing renderer code is deleted, so a regression in the validator can't break exports — only block certification.

## Out of scope this phase

- Hyphenation / justification quality (Phase 2 with renderer rewrite)
- Image DPI checks (already covered by Art Director)
- Index generation

Reply **"Approved — ship Phase 1"** and I'll create the layout module, validator, publication gate, UI report, and tests in a single batch.