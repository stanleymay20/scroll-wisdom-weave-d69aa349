/**
 * Copy-editing primitives for proofread-chapter.
 *
 * ScrollLibrary already has a developmental editor: chief-editor-audit scores
 * structure, cognitive depth, academic rigour, pedagogy and AI-detectability,
 * and the publication pipeline repairs failing chapters by REGENERATING them.
 * What it has never had is a proofreader. Nothing in the rubric covers
 * spelling, grammar, punctuation, agreement, tense consistency or word-level
 * repetition, so a chapter can score 85/100 and still read like a draft.
 *
 * Regeneration is the wrong instrument for that last mile. Asking a model to
 * rewrite a chapter to fix a comma splice invites it to reword paragraphs that
 * were already correct, drift from the cited evidence, and lose the author's
 * voice. So this pass never rewrites: the model returns individual
 * find/replace corrections and they are applied deterministically here, where
 * every one can be checked before it touches the manuscript.
 *
 * That inversion is the whole safety story. A rewrite has to be trusted
 * wholesale; a correction can be rejected for being unfindable, ambiguous,
 * oversized, or aimed at text that must not change.
 */

export type CorrectionKind =
  | "spelling"
  | "grammar"
  | "punctuation"
  | "agreement"
  | "tense"
  | "repetition"
  | "clarity";

export const CORRECTION_KINDS: readonly CorrectionKind[] = [
  "spelling",
  "grammar",
  "punctuation",
  "agreement",
  "tense",
  "repetition",
  "clarity",
];

export interface Correction {
  /** Exact text to replace. Must appear once in the chapter. */
  find: string;
  /** Replacement text. */
  replace: string;
  kind: CorrectionKind;
  /** Short human-readable justification, surfaced in the report. */
  note?: string;
}

export interface RejectedCorrection {
  correction: Correction;
  reason: RejectionReason;
}

export type RejectionReason =
  | "empty_find"
  | "no_op"
  | "not_found"
  | "ambiguous"
  | "oversized_find"
  | "rewrite_not_copyedit"
  | "protected_region"
  | "change_budget_exceeded"
  | "unknown_kind";

export interface ApplyResult {
  text: string;
  applied: Correction[];
  rejected: RejectedCorrection[];
  /** Net characters added or removed, as an absolute total. */
  changedChars: number;
}

export interface ApplyOptions {
  /**
   * Cap on cumulative change as a fraction of the chapter, after which further
   * corrections are refused. A genuine copyedit moves a small percentage of a
   * chapter; anything beyond this is a rewrite wearing a copyedit's clothes.
   */
  maxChangeRatio?: number;
  /** Longest acceptable `find`. A copyedit targets a phrase, not a section. */
  maxFindLength?: number;
}

const DEFAULT_MAX_CHANGE_RATIO = 0.12;
const DEFAULT_MAX_FIND_LENGTH = 400;

/**
 * Floor under the change budget, in characters.
 *
 * The ratio alone is meaningless on short text: a seven-character typo fix is
 * 30% of a twenty-three-character sentence, so a percentage guard would refuse
 * exactly the corrections this pass exists to make. The budget's job is to
 * stop a batch from rewriting a real chapter — thousands of characters — and
 * against that an unconditional 500-character allowance is negligible.
 */
const MIN_CHANGE_BUDGET = 500;

/**
 * A replacement may be longer than what it replaces — inserting a missing
 * clause or article is legitimate — but not unboundedly so.
 */
const MAX_REPLACE_GROWTH_FACTOR = 3;
const MAX_REPLACE_GROWTH_SLACK = 120;

export interface ProofreadWindow {
  index: number;
  start: number;
  end: number;
  text: string;
}

/**
 * Split a chapter into overlapping windows that cover it completely.
 *
 * Completeness is the point: the defect this endpoint exists to fix is content
 * the auditor never looked at, so a windowing scheme that could skip a region
 * would reproduce the original bug in a new place. Windows overlap so a
 * sentence spanning a boundary is still seen whole by at least one window.
 */
export function planWindows(
  content: string,
  windowSize: number,
  overlap: number,
): ProofreadWindow[] {
  const text = content || "";
  const size = Math.max(1, Math.floor(windowSize));
  // Cap the overlap at half the window. An overlap at or above the window size
  // would make no forward progress at all, and even one just below it would
  // advance a character at a time — terminating, but emitting thousands of
  // windows, which downstream is thousands of AI calls. Half a window bounds
  // the count to roughly 2 * length / size while keeping coverage complete.
  const lap = Math.min(Math.max(0, Math.floor(overlap)), Math.floor(size / 2));

  if (text.length === 0) return [];
  if (text.length <= size) {
    return [{ index: 0, start: 0, end: text.length, text }];
  }

  const windows: ProofreadWindow[] = [];
  const step = size - lap;
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + size);
    windows.push({ index, start, end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start += step;
    index++;
  }

  return windows;
}

/**
 * Regions a copyedit must never alter.
 *
 * Figure markers are parsed downstream by visual-intelligence and a stray
 * "correction" to their structure silently drops an illustration. Citations
 * are load-bearing evidence: publicationEvidence verifies author-year markers
 * against real sources, so editing one turns a verified claim into an
 * unverifiable one. Code and links break outright if reflowed.
 */
export function protectedSpans(content: string): Array<[number, number]> {
  const text = content || "";
  const spans: Array<[number, number]> = [];

  const patterns: RegExp[] = [
    // Structured figure markers: [FIGURE 1\nTYPE: ...\nCAPTION: ...\nDESCRIPTION: ...]
    /\[FIGURE\s*\d+[\s\S]*?\]/gi,
    // Fenced code blocks.
    /```[\s\S]*?```/g,
    // Inline code.
    /`[^`\n]*`/g,
    // Markdown links and images.
    /!?\[[^\]\n]*\]\([^)\n]*\)/g,
    // Author-year citations, mirroring src/lib/claimExtraction.ts.
    /\(([A-Z][a-zA-Zà-ÿ]+(?:\s(?:&|and)\s[A-Z][a-zA-Zà-ÿ]+)*(?:\s+et\s+al\.?)?),?\s*\d{4}(?:,\s*p\.?\s*\d+)?\)/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      spans.push([match.index, match.index + match[0].length]);
      // A zero-length match would spin forever.
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }

  return spans.sort((a, b) => a[0] - b[0]);
}

function overlapsProtected(start: number, end: number, spans: Array<[number, number]>): boolean {
  for (const [spanStart, spanEnd] of spans) {
    if (start < spanEnd && end > spanStart) return true;
  }
  return false;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/**
 * Apply corrections to a chapter, refusing any that cannot be made safely.
 *
 * Each correction is re-checked against the CURRENT text rather than the
 * original, because an earlier correction can change what a later one matches.
 * Protected spans are likewise recomputed per correction — applying an edit
 * shifts every offset after it.
 */
export function applyCorrections(
  content: string,
  corrections: Correction[],
  options: ApplyOptions = {},
): ApplyResult {
  const maxChangeRatio = options.maxChangeRatio ?? DEFAULT_MAX_CHANGE_RATIO;
  const maxFindLength = options.maxFindLength ?? DEFAULT_MAX_FIND_LENGTH;

  let text = content || "";
  const applied: Correction[] = [];
  const rejected: RejectedCorrection[] = [];
  const changeBudget = Math.max(MIN_CHANGE_BUDGET, Math.floor(text.length * maxChangeRatio));
  let changedChars = 0;

  for (const correction of corrections || []) {
    const find = correction?.find ?? "";
    const replace = correction?.replace ?? "";

    if (!CORRECTION_KINDS.includes(correction?.kind)) {
      rejected.push({ correction, reason: "unknown_kind" });
      continue;
    }
    if (find.length === 0) {
      rejected.push({ correction, reason: "empty_find" });
      continue;
    }
    if (find === replace) {
      rejected.push({ correction, reason: "no_op" });
      continue;
    }
    if (find.length > maxFindLength) {
      rejected.push({ correction, reason: "oversized_find" });
      continue;
    }
    if (replace.length > find.length * MAX_REPLACE_GROWTH_FACTOR + MAX_REPLACE_GROWTH_SLACK) {
      rejected.push({ correction, reason: "rewrite_not_copyedit" });
      continue;
    }

    const occurrences = countOccurrences(text, find);
    if (occurrences === 0) {
      // The model proposed an edit to text that is not in the chapter.
      rejected.push({ correction, reason: "not_found" });
      continue;
    }
    if (occurrences > 1) {
      // Applying to the first of several matches would be a guess.
      rejected.push({ correction, reason: "ambiguous" });
      continue;
    }

    const at = text.indexOf(find);
    if (overlapsProtected(at, at + find.length, protectedSpans(text))) {
      rejected.push({ correction, reason: "protected_region" });
      continue;
    }

    // Characters touched by this edit. Not edit distance — the point is to
    // bound how much of the chapter the batch rewrites, and the longer of the
    // two strings is the honest measure of how much text the edit disturbs.
    const delta = Math.max(find.length, replace.length);
    if (changedChars + delta > changeBudget) {
      rejected.push({ correction, reason: "change_budget_exceeded" });
      continue;
    }

    text = text.slice(0, at) + replace + text.slice(at + find.length);
    changedChars += delta;
    applied.push({ ...correction, find, replace });
  }

  return { text, applied, rejected, changedChars };
}

/** Group applied corrections by kind, for the response summary. */
export function summarizeByKind(corrections: Correction[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const correction of corrections) {
    const kind = correction?.kind ?? "unknown";
    summary[kind] = (summary[kind] || 0) + 1;
  }
  return summary;
}
