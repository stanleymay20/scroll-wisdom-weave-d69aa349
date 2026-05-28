/**
 * Export Quality Auditor
 * Evaluates a normalized book and produces a Ready/Needs review/Blocked score.
 * Powers the in-app Export Preview and gates paid publishing.
 */
import type { CanonicalChapter, CanonicalBlock } from "./canonicalContent.ts";

export type ExportQualityStatus = "ready" | "needs_review" | "blocked";
export type ExportIssueSeverity = "blocker" | "warning" | "info";

export interface ExportIssue {
  severity: ExportIssueSeverity;
  code: string;
  message: string;
  chapter?: number;
  hint?: string;
}

export interface ExportQualityReport {
  status: ExportQualityStatus;
  score: number; // 0-100
  issues: ExportIssue[];
  totals: {
    chapters: number;
    words: number;
    images: number;
    tables: number;
    codeBlocks: number;
  };
}

const MAX_IMAGE_URL_LEN = 8 * 1024; // proxy for "too large" base64 inlined images
const CODE_LINE_HARD_WRAP = 120; // PDF / DOCX safe wrap threshold

export function auditBookForExport(
  canonical: CanonicalChapter[],
  options: { hasCover: boolean; bookType?: string | null } = { hasCover: false },
): ExportQualityReport {
  const issues: ExportIssue[] = [];
  const totals = { chapters: canonical.length, words: 0, images: 0, tables: 0, codeBlocks: 0 };

  if (!options.hasCover) {
    issues.push({
      severity: "warning",
      code: "no_cover",
      message: "No cover image set",
      hint: "Add a cover so PDF / EPUB / KDP exports have a front page.",
    });
  }

  if (canonical.length === 0) {
    issues.push({
      severity: "blocker",
      code: "no_chapters",
      message: "Book has no chapters to export",
    });
  }

  for (const ch of canonical) {
    totals.words += ch.stats.words;
    totals.images += ch.stats.images;
    totals.tables += ch.stats.tables;
    totals.codeBlocks += ch.stats.codeBlocks;

    if (!ch.title?.trim()) {
      issues.push({
        severity: "blocker",
        code: "missing_chapter_title",
        message: `Chapter ${ch.chapter_number} has no title`,
        chapter: ch.chapter_number,
      });
    }

    if (ch.stats.words < 30 && ch.blocks.length === 0) {
      issues.push({
        severity: "blocker",
        code: "empty_chapter",
        message: `Chapter ${ch.chapter_number} appears empty`,
        chapter: ch.chapter_number,
      });
    } else if (ch.stats.words < 80) {
      issues.push({
        severity: "warning",
        code: "short_chapter",
        message: `Chapter ${ch.chapter_number} is very short (${ch.stats.words} words)`,
        chapter: ch.chapter_number,
      });
    }

    // Heading hierarchy: levels should not jump (e.g. H1 → H4)
    let lastHeading: number | null = null;
    for (const b of ch.blocks) {
      if (b.kind === "heading" && typeof b.level === "number") {
        if (lastHeading !== null && b.level - lastHeading > 1) {
          issues.push({
            severity: "warning",
            code: "heading_hierarchy_skip",
            message: `Chapter ${ch.chapter_number}: heading jumps from H${lastHeading} to H${b.level}`,
            chapter: ch.chapter_number,
            hint: "Readers and EPUB TOCs render best with sequential levels.",
          });
        }
        lastHeading = b.level;
      }
    }

    for (const b of ch.blocks) {
      checkBlock(b, ch.chapter_number, issues);
    }
  }

  // Score = 100 − 25 per blocker − 5 per warning, floored at 0
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - blockers * 25 - warnings * 5);
  const status: ExportQualityStatus = blockers > 0 ? "blocked" : warnings > 0 ? "needs_review" : "ready";

  return { status, score, issues, totals };
}

function checkBlock(b: CanonicalBlock, chapter: number, issues: ExportIssue[]) {
  if (b.kind === "image" && b.image) {
    if (!b.image.src) {
      issues.push({ severity: "warning", code: "image_missing_src", message: `Chapter ${chapter}: image with no source`, chapter });
    } else if (b.image.src.startsWith("data:") && b.image.src.length > MAX_IMAGE_URL_LEN) {
      issues.push({
        severity: "warning",
        code: "image_oversized_inline",
        message: `Chapter ${chapter}: oversized inline image (${Math.round(b.image.src.length / 1024)} KB)`,
        chapter,
        hint: "Inline base64 images bloat exports — host the image and reference it by URL.",
      });
    } else if (/\.(svg|webp|gif)(\?|$)/i.test(b.image.src)) {
      issues.push({
        severity: "warning",
        code: "image_format_unsupported_docx",
        message: `Chapter ${chapter}: ${b.image.src.split("?")[0].split(".").pop()?.toUpperCase()} image may not render in DOCX`,
        chapter,
      });
    }
  }

  if (b.kind === "code" && b.code) {
    const longLine = b.code.source.split("\n").some((ln: string) => ln.length > CODE_LINE_HARD_WRAP);
    if (longLine) {
      issues.push({
        severity: "warning",
        code: "code_line_too_wide",
        message: `Chapter ${chapter}: code block has lines wider than ${CODE_LINE_HARD_WRAP} chars`,
        chapter,
        hint: "Long code lines clip in PDF and KDP exports.",
      });
    }
  }

  if (b.kind === "table" && b.table) {
    const cols = b.table.header.length;
    const malformed = b.table.rows.some((r) => r.length !== cols);
    if (malformed) {
      issues.push({
        severity: "warning",
        code: "table_row_mismatch",
        message: `Chapter ${chapter}: table row column count doesn't match header`,
        chapter,
      });
    }
    if (cols > 6) {
      issues.push({
        severity: "warning",
        code: "table_too_wide",
        message: `Chapter ${chapter}: ${cols}-column table may overflow KDP/EPUB pages`,
        chapter,
      });
    }
  }

  if (b.kind === "paragraph" && b.text) {
    // Detect unrenderable / replacement characters that often signal PDF font issues.
    if (/\uFFFD/.test(b.text)) {
      issues.push({
        severity: "warning",
        code: "unicode_replacement_char",
        message: `Chapter ${chapter}: unrenderable Unicode character detected`,
        chapter,
        hint: "Some PDF fonts will drop this glyph entirely.",
      });
    }
  }
}

export function qualityStatusLabel(s: ExportQualityStatus): string {
  if (s === "ready") return "Ready";
  if (s === "needs_review") return "Needs review";
  return "Blocked";
}
