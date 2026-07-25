// Publishability QA Auditor
// -------------------------
// Runs a battery of deterministic, offline checks over a book's chapters and
// produces a per-book "will this ship?" report. Combines:
//   - Content quality (AI preambles, refusals, placeholders, dangerous HTML)
//   - Structural quality (empty/short chapters, heading hierarchy, tables)
//   - Rendering risk (unresolved LaTeX, long code tokens, orphaned figures,
//     unbalanced fences, mismatched pipe tables, replacement chars)
//   - Citation coverage (references block presence when claims exist)
//
// This module is the deterministic backbone that all downstream QA slices
// (LLM validators, code executors) build on top of. Same input ⇒ same output.

import { auditChapterArtifacts, type ContentIssue } from "./content-quality.ts";
import { parseBookToCanonical, type CanonicalChapter } from "./canonicalContent.ts";
import { auditBookForExport, type ExportIssue } from "./exportQuality.ts";

export type QAStatus = "ready" | "needs_review" | "blocked";
export type QASeverity = "blocker" | "warning" | "info";

export interface QAIssue {
  severity: QASeverity;
  code: string;
  message: string;
  chapter?: number;
  hint?: string;
  /** Optional bucket used to group issues in the UI. */
  category:
    | "content"        // AI artifacts, placeholders, refusals
    | "structure"      // chapters, headings, tables
    | "rendering"      // LaTeX, code truncation, figures, unicode
    | "citations"      // references / claims
    | "export";        // export-specific (images, formats)
}

export interface QAReport {
  status: QAStatus;
  score: number; // 0-100
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  totals: {
    chapters: number;
    words: number;
    images: number;
    tables: number;
    codeBlocks: number;
  };
  issues: QAIssue[];
  /** Grouped by category — handy for the UI. */
  byCategory: Record<string, number>;
}

export interface QAChapterInput {
  chapter_number: number;
  title: string;
  content: string | null;
}

// --- Rendering risk detectors ------------------------------------------------

// $...$ / $$...$$ / \\alpha / \\frac{}{} / \\begin{...}
const LATEX_INLINE_RE = /(?<!\\)\$[^$\n]{1,200}\$/;
const LATEX_DISPLAY_RE = /\$\$[\s\S]{1,600}?\$\$/;
const LATEX_MACRO_RE = /\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|sum|int|frac|sqrt|infty|partial|nabla|cdot|times|leq|geq|neq|approx|begin|end|mathbb|mathcal|mathrm)\b/;

const REPLACEMENT_CHAR_RE = /\uFFFD/;
const ORPHAN_FIGURE_RE = /\[FIGURE\b[^\]]*\]/i;
const LOOSE_PIPE_TABLE_RE = /^\s*\|.*\|.*\|/m;
// A "long token" that will truncate in exports: a single unbroken sequence
// of >= 90 non-space chars OUTSIDE a code fence.
const LONG_TOKEN_THRESHOLD = 90;

function countFences(s: string): number {
  return (s.match(/^[ \t]*```/gm) || []).length;
}

function hasLongToken(s: string): boolean {
  const stripped = s.replace(/```[\s\S]*?```/g, ""); // strip fenced code
  for (const tok of stripped.split(/\s+/)) {
    if (tok.length >= LONG_TOKEN_THRESHOLD) return true;
  }
  return false;
}

function hasLongCodeLine(s: string): boolean {
  const fences = s.match(/```[\s\S]*?```/g) || [];
  for (const block of fences) {
    for (const line of block.split("\n")) {
      // 120 = PDF/DOCX safe wrap; export-book uses this too.
      if (line.length > 120) return true;
    }
  }
  return false;
}

function detectRenderingIssues(
  content: string,
  chapter: number,
): QAIssue[] {
  const issues: QAIssue[] = [];
  if (!content) return issues;

  if (LATEX_INLINE_RE.test(content) || LATEX_DISPLAY_RE.test(content) || LATEX_MACRO_RE.test(content)) {
    issues.push({
      severity: "warning",
      code: "latex_unresolved",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: LaTeX math detected — verify Unicode conversion`,
      hint: "PDF/EPUB exporters convert common LaTeX to Unicode, but complex expressions may render as raw source.",
    });
  }

  if (REPLACEMENT_CHAR_RE.test(content)) {
    issues.push({
      severity: "warning",
      code: "unicode_replacement",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: unrenderable Unicode character (U+FFFD)`,
      hint: "Some PDF fonts drop this glyph. Re-encode the source.",
    });
  }

  if (ORPHAN_FIGURE_RE.test(content)) {
    issues.push({
      severity: "blocker",
      code: "orphan_figure_marker",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: unrendered [FIGURE ...] marker`,
      hint: "Replace the placeholder with a real image or delete the marker before export.",
    });
  }

  if (countFences(content) % 2 !== 0) {
    issues.push({
      severity: "blocker",
      code: "unbalanced_code_fence",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: unbalanced code fence (\`\`\`)`,
      hint: "Add the missing closing fence — otherwise the rest of the chapter renders as code.",
    });
  }

  if (hasLongToken(content)) {
    issues.push({
      severity: "warning",
      code: "long_token_truncation_risk",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: contains a very long unbroken token (≥${LONG_TOKEN_THRESHOLD} chars)`,
      hint: "Long tokens (URLs, hashes) may overflow the printable width in PDF/EPUB.",
    });
  }

  if (hasLongCodeLine(content)) {
    issues.push({
      severity: "warning",
      code: "long_code_line",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: code line exceeds 120 chars`,
      hint: "PDF/DOCX now wrap these, but long code lines still hurt readability.",
    });
  }

  return issues;
}

// --- Citation coverage -------------------------------------------------------

const REFERENCE_HEADER_RE = /^\s*#{1,6}\s+(?:References|Bibliography|Works Cited|Sources)\s*$/im;
const CITATION_MARKER_RE = /\[(?:\d{1,3}|@[a-z][\w-]*)\]/i;

function detectCitationGaps(content: string, chapter: number): QAIssue[] {
  if (!content) return [];
  const hasCitations = CITATION_MARKER_RE.test(content);
  const hasRefs = REFERENCE_HEADER_RE.test(content);
  if (hasCitations && !hasRefs) {
    return [{
      severity: "warning",
      code: "citations_without_references",
      category: "citations",
      chapter,
      message: `Chapter ${chapter}: citation markers [n] present but no References section`,
      hint: "Add a References/Bibliography section listing each cited source.",
    }];
  }
  return [];
}

// --- Orchestrator ------------------------------------------------------------

function toQAIssue(i: ContentIssue, category: QAIssue["category"]): QAIssue {
  return { severity: i.severity, code: i.code, message: i.message, chapter: i.chapter, hint: i.hint, category };
}

function fromExportIssue(i: ExportIssue): QAIssue {
  // Only warning/blocker categories overlap; map info by default.
  const sev: QASeverity = i.severity === "blocker" ? "blocker" : i.severity === "warning" ? "warning" : "info";
  return {
    severity: sev,
    code: `export_${i.code}`,
    message: i.message,
    chapter: i.chapter,
    hint: i.hint,
    category: "export",
  };
}

export function auditBookForPublishability(
  chapters: QAChapterInput[],
  options: { hasCover: boolean; bookType?: string | null } = { hasCover: false },
): QAReport {
  const issues: QAIssue[] = [];

  // 1. Content-artifact audit (AI preambles etc.)
  for (const ch of chapters) {
    for (const ci of auditChapterArtifacts(ch.content, ch.chapter_number)) {
      issues.push(toQAIssue(ci, "content"));
    }
    issues.push(...detectRenderingIssues(ch.content ?? "", ch.chapter_number));
    issues.push(...detectCitationGaps(ch.content ?? "", ch.chapter_number));
  }

  // 2. Canonical / structural / export audit
  const canonical: CanonicalChapter[] = parseBookToCanonical(chapters);
  const exportReport = auditBookForExport(canonical, options);
  for (const ei of exportReport.issues) {
    issues.push(fromExportIssue(ei));
  }

  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const score = Math.max(0, 100 - blockerCount * 20 - warningCount * 4 - infoCount);
  const status: QAStatus = blockerCount > 0 ? "blocked" : warningCount > 0 ? "needs_review" : "ready";

  const byCategory: Record<string, number> = {};
  for (const i of issues) byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;

  return {
    status,
    score,
    blockerCount,
    warningCount,
    infoCount,
    totals: exportReport.totals,
    issues,
    byCategory,
  };
}
