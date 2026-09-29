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

import { figureDataFor, parseRawFigureMarkers } from "./visual-intelligence.ts";

import { auditChapterArtifacts, type ContentIssue } from "./content-quality.ts";
import { parseBookToCanonical, type CanonicalChapter } from "./canonicalContent.ts";
import { auditBookForExport, type ExportIssue } from "./exportQuality.ts";
import { detectDeterministicCodeIssues } from "./technical-code-quality.ts";

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
    | "generation"     // incomplete/mismatched generation state
    | "technical"      // executable/code quality evidence
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
  /** Server generation truth. Omitted in legacy/unit-test callers. */
  is_generated?: boolean | null;
  /** Stored telemetry only; content is still re-inspected deterministically. */
  word_count?: number | null;
}

// --- Generation/editorial completeness --------------------------------------

const GENERATION_STUB_RE =
  /(?:Full chapter content is being generated|Content pending generation|generation pending|chapter content pending)/i;
const UNRESOLVED_EDITORIAL_RE =
  /\[(?:requires verification|citation needed|source needed|verify(?: this)?(?: claim| source)?|fact[- ]?check(?: needed)?)\]/i;

function detectGenerationIssues(
  chapters: QAChapterInput[],
  expectedChapterCount?: number | null,
): QAIssue[] {
  const issues: QAIssue[] = [];

  if (chapters.length === 0) {
    issues.push({
      severity: "blocker",
      code: "no_chapters",
      category: "generation",
      message: "Book contains no chapters.",
      hint: "Generate the manuscript before running publication QA.",
    });
    return issues;
  }

  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const chapter of chapters) {
    if (seen.has(chapter.chapter_number)) duplicates.add(chapter.chapter_number);
    seen.add(chapter.chapter_number);
  }
  if (duplicates.size > 0) {
    issues.push({
      severity: "blocker",
      code: "duplicate_chapter_numbers",
      category: "generation",
      message: `Duplicate chapter numbers: ${[...duplicates].sort((a, b) => a - b).join(", ")}`,
      hint: "Chapter numbering must be unique and sequential before publication.",
    });
  }

  if (expectedChapterCount != null && expectedChapterCount > 0) {
    if (chapters.length !== expectedChapterCount) {
      issues.push({
        severity: "blocker",
        code: "chapter_count_mismatch",
        category: "generation",
        message: `Book declares ${expectedChapterCount} chapters but stores ${chapters.length}.`,
        hint: "Regenerate or repair the outline so persisted chapter count matches the book contract.",
      });
    }

    const missing: number[] = [];
    for (let n = 1; n <= expectedChapterCount; n++) {
      if (!seen.has(n)) missing.push(n);
    }
    if (missing.length > 0) {
      issues.push({
        severity: "blocker",
        code: "missing_chapter_numbers",
        category: "generation",
        message: `Missing chapter number${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
        hint: "Every declared chapter number must exist exactly once.",
      });
    }

    const extras = [...seen].filter((n) => n < 1 || n > expectedChapterCount).sort((a, b) => a - b);
    if (extras.length > 0) {
      issues.push({
        severity: "blocker",
        code: "out_of_range_chapter_numbers",
        category: "generation",
        message: `Out-of-range chapter number${extras.length === 1 ? "" : "s"}: ${extras.join(", ")}`,
        hint: "Persist only chapters within the server-authorized outline range.",
      });
    }
  }

  for (const chapter of chapters) {
    const content = chapter.content ?? "";
    if (chapter.is_generated === false) {
      issues.push({
        severity: "blocker",
        code: "chapter_not_generated",
        category: "generation",
        chapter: chapter.chapter_number,
        message: `Chapter ${chapter.chapter_number} is still an outline/draft shell.`,
        hint: "Generate the full chapter before publication certification.",
      });
    }
    if (!content.trim()) {
      issues.push({
        severity: "blocker",
        code: "empty_chapter",
        category: "generation",
        chapter: chapter.chapter_number,
        message: `Chapter ${chapter.chapter_number} has no manuscript content.`,
        hint: "A publication candidate cannot contain empty chapters.",
      });
    } else if (GENERATION_STUB_RE.test(content)) {
      issues.push({
        severity: "blocker",
        code: "generation_stub_visible",
        category: "generation",
        chapter: chapter.chapter_number,
        message: `Chapter ${chapter.chapter_number} still contains generation placeholder text.`,
        hint: "Replace the outline stub with the completed chapter.",
      });
    }
    if (UNRESOLVED_EDITORIAL_RE.test(content)) {
      issues.push({
        severity: "blocker",
        code: "unresolved_editorial_verification",
        category: "citations",
        chapter: chapter.chapter_number,
        message: `Chapter ${chapter.chapter_number} contains an unresolved verification/editorial marker.`,
        hint: "Verify, rewrite, or remove the unsupported claim before publication.",
      });
    }
  }

  return issues;
}

// --- Rendering risk detectors ------------------------------------------------

/**
 * True when the chapter holds a figure marker that nothing can render.
 *
 * Markers with a validated DATA payload are drawn as diagrams and are
 * legitimate manuscript content; everything else bracketed is a leftover
 * directive that would print raw.
 */
function hasUnrenderableFigureMarker(content: string): boolean {
  const markers = parseRawFigureMarkers(content);
  // A bracketed thing this parser does not recognise is still an orphan.
  if (markers.length === 0) return true;
  return markers.some((marker) => !figureDataFor(marker));
}


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

  // A marker carrying a validated DATA payload is not an orphan. It is a
  // diagram the reader and every exporter draw from its structure, so the
  // check asks whether any marker LACKS usable data rather than whether a
  // marker exists at all — otherwise shipping a real diagram would block the
  // book it is part of.
  if (ORPHAN_FIGURE_RE.test(content) && hasUnrenderableFigureMarker(content)) {
    issues.push({
      severity: "blocker",
      code: "orphan_figure_marker",
      category: "rendering",
      chapter,
      message: `Chapter ${chapter}: unrendered [FIGURE ...] marker`,
      hint: "Replace the placeholder with a real image, supply a DATA payload, or delete the marker before export.",
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
  options: { hasCover: boolean; bookType?: string | null; expectedChapterCount?: number | null } = { hasCover: false },
): QAReport {
  const issues: QAIssue[] = [];

  // 0. Server-owned generation truth and editorial leakage.
  issues.push(...detectGenerationIssues(chapters, options.expectedChapterCount));

  // 1. Content-artifact audit (AI preambles etc.)
  for (const ch of chapters) {
    for (const ci of auditChapterArtifacts(ch.content, ch.chapter_number)) {
      issues.push(toQAIssue(ci, "content"));
    }
    issues.push(...detectRenderingIssues(ch.content ?? "", ch.chapter_number));
    issues.push(...detectCitationGaps(ch.content ?? "", ch.chapter_number));

    for (const codeIssue of detectDeterministicCodeIssues(ch.content ?? "")) {
      issues.push({
        severity: codeIssue.severity,
        code: codeIssue.code,
        category: "technical",
        chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${codeIssue.message}`,
        hint: "Repair the code and rerun the content-bound STO audit before publication.",
      });
    }
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


/**
 * Add server-derived evidence issues (for example, missing content-bound code
 * audits) without weakening the deterministic score/status calculation.
 */
export function appendQAIssues(report: QAReport, extra: QAIssue[]): QAReport {
  if (extra.length === 0) return report;

  const issues = [...report.issues, ...extra];
  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;
  const score = Math.max(0, 100 - blockerCount * 20 - warningCount * 4 - infoCount);
  const status: QAStatus = blockerCount > 0 ? "blocked" : warningCount > 0 ? "needs_review" : "ready";

  const byCategory: Record<string, number> = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  return {
    ...report,
    issues,
    blockerCount,
    warningCount,
    infoCount,
    score,
    status,
    byCategory,
  };
}
