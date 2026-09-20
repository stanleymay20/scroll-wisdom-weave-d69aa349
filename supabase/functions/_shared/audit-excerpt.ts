/**
 * Chapter excerpting for the Chief Editor audit.
 *
 * The audit sends every chapter of a book to the model in a single prompt, so
 * chapter content has to be bounded. It previously used a flat
 * `content.slice(0, 8000)`, which bounded the prompt but had a systematic
 * blind spot: 8000 characters is roughly 1300 words against chapter targets of
 * 1500-2200 words, so the last third of most chapters was never audited. That
 * is precisely where generated prose degrades — repetition, padding, rushed
 * closings and unresolved threads accumulate at the end, not the beginning —
 * so the audit was structurally unable to see the defects it exists to catch.
 *
 * The budget here is derived from the chapter count instead of fixed, and when
 * a chapter does not fit it is excerpted from BOTH ends rather than truncated.
 * A chapter's ending is always audited, whatever the book's size.
 */

/**
 * Total character budget for chapter content across the whole audit prompt.
 * ~360k characters is ~90k tokens, comfortable for the Gemini 2.5 models this
 * audit routes to (1M context) while keeping a single audit affordable.
 */
export const AUDIT_TOTAL_CONTENT_BUDGET = 360_000;

/**
 * Per-chapter ceiling. ~18k characters is ~2900 words, so every chapter of a
 * normally-sized book is audited in full and nothing is elided at all.
 */
export const AUDIT_MAX_PER_CHAPTER = 18_000;

/**
 * Per-chapter floor. For books large enough that the total budget would divide
 * below this, the floor wins and the prompt grows instead. Seeing every
 * chapter's opening AND closing is worth more than a smaller prompt; a 100
 * chapter book is rare and is the top subscription tier's privilege.
 */
export const AUDIT_MIN_PER_CHAPTER = 5_000;

/** Fraction of a chapter's budget spent on its opening. */
const HEAD_SHARE = 0.55;

/** Do not hunt further than this for a word boundary before cutting mid-word. */
const BOUNDARY_SEARCH_WINDOW = 200;

export interface ChapterExcerpt {
  /** The excerpt to put in the prompt. */
  text: string;
  /** Characters removed from the middle. 0 when the chapter is complete. */
  elidedChars: number;
  /** True when the model sees the entire chapter. */
  complete: boolean;
}

/**
 * Per-chapter character budget for a book with `chapterCount` chapters.
 */
export function chapterExcerptBudget(chapterCount: number): number {
  if (!Number.isFinite(chapterCount) || chapterCount <= 0) return AUDIT_MAX_PER_CHAPTER;
  const share = Math.floor(AUDIT_TOTAL_CONTENT_BUDGET / chapterCount);
  return Math.min(AUDIT_MAX_PER_CHAPTER, Math.max(AUDIT_MIN_PER_CHAPTER, share));
}

/** Largest index <= `limit` that sits on whitespace, or `limit` if none is near. */
function cutBackToBoundary(text: string, limit: number): number {
  if (limit <= 0) return 0;
  if (limit >= text.length) return text.length;
  const floor = Math.max(0, limit - BOUNDARY_SEARCH_WINDOW);
  for (let i = limit; i > floor; i--) {
    if (/\s/.test(text[i])) return i;
  }
  return limit;
}

/** Smallest index >= `from` that sits on whitespace, or `from` if none is near. */
function cutForwardToBoundary(text: string, from: number): number {
  if (from <= 0) return 0;
  if (from >= text.length) return text.length;
  const ceiling = Math.min(text.length, from + BOUNDARY_SEARCH_WINDOW);
  for (let i = from; i < ceiling; i++) {
    if (/\s/.test(text[i])) return i;
  }
  return from;
}

/**
 * Excerpt a chapter to fit `budget` characters of content.
 *
 * Under budget the chapter is returned whole. Over budget the opening and the
 * closing are both kept and the middle is replaced by a marker that states how
 * much was removed, so the model is told what it cannot see rather than being
 * silently handed a fragment that looks complete. The returned text exceeds
 * `budget` by the length of that marker, which is intentional: the marker is
 * instruction to the model, not chapter content.
 */
export function excerptForAudit(content: string, budget: number): ChapterExcerpt {
  const text = content || "";
  const safeBudget = Math.max(0, Math.floor(budget));

  if (safeBudget <= 0 || text.length <= safeBudget) {
    return { text, elidedChars: 0, complete: true };
  }

  const headBudget = Math.max(1, Math.floor(safeBudget * HEAD_SHARE));
  const tailBudget = Math.max(1, safeBudget - headBudget);

  const headEnd = cutBackToBoundary(text, headBudget);
  const tailStart = cutForwardToBoundary(text, text.length - tailBudget);

  // A boundary hunt can, on pathological input, push the cuts past each other.
  // Fall back to a plain head/tail split rather than emitting overlapping text.
  if (tailStart <= headEnd) {
    return { text, elidedChars: 0, complete: true };
  }

  const elidedChars = tailStart - headEnd;
  const head = text.slice(0, headEnd).trimEnd();
  const tail = text.slice(tailStart).trimStart();

  return {
    text: `${head}\n\n[... ${elidedChars} characters elided from the middle of this chapter; the opening and closing below are verbatim ...]\n\n${tail}`,
    elidedChars,
    complete: false,
  };
}
