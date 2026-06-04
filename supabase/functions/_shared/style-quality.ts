// Literary-polish auditor for export-bound chapters.
//
// What this catches that content-quality.ts doesn't
// -------------------------------------------------
// content-quality.ts removes the obvious AI tells (preambles, placeholders,
// dangerous HTML, structural breakage). What it can't see is the *texture*
// of the prose — the dead giveaways that distinguish "competent LLM output"
// from "elite-tier publisher output":
//
//   * Cliché density. LLMs lean on a small set of crutch phrases — "delve
//     into", "tapestry", "stands as a testament", "navigate the landscape",
//     "rich and vibrant", "in conclusion". Any one is fine; a chapter
//     studded with them reads instantly as machine-generated.
//   * Em-dash density. Claude's signature flourish. Three per page is
//     literary; eight per page is a tell.
//   * Adverb density. The Stephen King heuristic — "the road to hell is
//     paved with adverbs". -ly words above ~3% of word count is a red flag.
//   * Passive voice rate. Above ~10% of sentences degrades readability and
//     trips most editor-side style guides.
//   * Sentence-starter repetition. "She walked. She paused. She listened."
//     Three+ consecutive sentences starting with the same word/POV pronoun
//     is a rhythm failure.
//   * Paragraph rhythm. Walls of text (paragraph >400 words) AND choppy
//     fragments (chapter where >40% of paragraphs are ≤2 sentences) both
//     fail the elite bar.
//   * Reading-grade consistency. A chapter at FK grade 6 next to one at
//     grade 14 means the voice is drifting.
//
// What this module does NOT do
// ----------------------------
// It does not judge literary merit (uncomputable). It does not detect plot
// holes. It does not check factual accuracy. It quantifies the surface
// patterns that distinguish AI-flat prose from publisher-grade prose, so
// the creator can address the specific paragraphs that fail.
//
// All exports are pure functions. Same inputs ⇒ same outputs.

import type { ContentIssue } from "./content-quality.ts";

// ─── Bank: clichés / AI crutch phrases ─────────────────────────────────────

/**
 * Phrases below are common LLM crutches. Any single occurrence is fine —
 * the auditor counts density per 1k words and flags when the rate is
 * publisher-unfriendly. The list errs on the side of obvious tells: words
 * that mark prose as LLM-generated to any experienced editor.
 */
export const CLICHE_BANK: string[] = [
  // Generic LLM filler
  "delve into", "delves into", "delving into",
  "tapestry", "rich tapestry",
  "navigate the landscape", "navigating the landscape", "complex landscape",
  "in the realm of", "the realm of",
  "stands as a testament", "stand as a testament", "a testament to",
  "in conclusion,", "to conclude,", "in summary,",
  "in essence,", "essentially,",
  "it is important to note", "it's important to note", "it's worth noting", "it is worth noting",
  "as we have seen", "as we've seen",
  "embark on a journey", "embark on this journey",
  "the intricate dance", "intricate dance of",
  "rich and vibrant", "vibrant tapestry",
  "shed light on", "sheds light on",
  "at the heart of",
  "the world of",
  "in today's world", "in today's society", "in modern society",
  "play a crucial role", "plays a crucial role", "plays a pivotal role",
  "a wide array of", "a myriad of",
  "stands out as", "set the stage for",
  "furthermore,", "moreover,", "additionally,",
  "in the world of",
  "a complex interplay", "complex interplay of",
  "in the ever-evolving", "the ever-changing landscape",
  "paramount importance", "of utmost importance",
  "captivating", "captivating story", "captivating tale",
  "a deep dive", "deep dive into",
  "unlock the potential", "unlocking the potential",
  "harness the power", "harnessing the power",
  "at its core", "at the core of",
  "the journey of",
  "an unparalleled", "unparalleled",
];

// Pre-compile a single global regex so we scan in one pass. Word-boundaried,
// case-insensitive.
const CLICHE_RE = new RegExp(
  "\\b(?:" + CLICHE_BANK.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
  "gi",
);

// ─── Tokenisation helpers ──────────────────────────────────────────────────

const WORD_RE = /\b[A-Za-z][A-Za-z'’-]*\b/g;
const SENTENCE_SPLIT_RE = /(?<=[.!?…])\s+(?=[A-Z"'“‘])|\n{2,}/;
const PARAGRAPH_SPLIT_RE = /\n{2,}/;

export function wordCount(text: string): number {
  return (text.match(WORD_RE) || []).length;
}

function stripCode(text: string): string {
  // Drop fenced code and inline code so they don't poison density metrics.
  let out = text.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/`[^`]*`/g, "");
  return out;
}

function splitSentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter((s) => s.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text.split(PARAGRAPH_SPLIT_RE).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ─── Metric calculations ───────────────────────────────────────────────────

export interface ChapterStyleMetrics {
  chapter_number: number;
  words: number;
  sentences: number;
  paragraphs: number;

  cliches: { count: number; per_1k_words: number; samples: string[] };
  em_dashes: { count: number; per_1k_words: number };
  adverbs: { count: number; rate: number };       // -ly words / words
  passive: { count: number; rate: number };       // passive sentences / sentences
  starter_repetition: { runs: number; longest_run: number };
  paragraph_rhythm: {
    avg_words: number;
    walls: number;       // paragraphs > 400 words
    fragments: number;   // paragraphs ≤ 2 sentences
    fragment_rate: number;
  };
  reading_grade: number; // Flesch-Kincaid grade
}

// Pure adverb detector. Excludes safe non-adverb -ly words.
const NON_ADVERB_LY = new Set([
  "family", "rally", "lily", "really", "only", "july",
  "italy", "early", "ugly", "holy", "july", "supply", "reply",
  "ally", "belly", "jelly", "tally", "valley", "dally", "folly",
  "fully", "duly", "lonely",
]);

function isAdverb(token: string): boolean {
  const t = token.toLowerCase();
  if (!t.endsWith("ly") || t.length < 5) return false;
  if (NON_ADVERB_LY.has(t)) return false;
  return true;
}

// Lightweight passive-voice detector. Looks for "be"/"was"/"were"/"been"
// followed by a past-participle within a small window. Not exhaustive — no
// POS tagger here — but catches the obvious cases publisher editors target.
const BE_FORMS = /\b(?:am|is|are|was|were|be|been|being)\b/i;
const PAST_PARTICIPLE = /\b\w+(?:ed|en|n|t)\b/i;

function isPassiveSentence(s: string): boolean {
  const beMatch = BE_FORMS.exec(s);
  if (!beMatch) return false;
  // Look at the next 5 tokens after the be-form.
  const rest = s.slice((beMatch.index ?? 0) + beMatch[0].length);
  const next = rest.split(/\s+/).slice(0, 5).join(" ");
  return PAST_PARTICIPLE.test(next);
}

// Flesch-Kincaid grade ≈ 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = stripped.match(/[aeiouy]{1,2}/g) || [];
  return Math.max(1, groups.length);
}
function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (sentences === 0 || words === 0) return 0;
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

// Sentence-starter repetition: any run of ≥3 consecutive sentences whose
// first word is identical (case-insensitive) and not a stopword like "But".
const STOPSTART = new Set(["but", "and", "yet", "so", "or", "for", "nor"]);

function starterRuns(sentences: string[]): { runs: number; longest: number } {
  let runs = 0;
  let longest = 0;
  let run = 1;
  let prev: string | null = null;
  for (const s of sentences) {
    const first = (s.match(/[A-Za-z'’-]+/) || [""])[0].toLowerCase();
    if (!first) { prev = null; run = 1; continue; }
    if (first === prev && !STOPSTART.has(first)) {
      run += 1;
      if (run >= 3) {
        if (run === 3) runs += 1;
        if (run > longest) longest = run;
      }
    } else {
      run = 1;
    }
    prev = first;
  }
  return { runs, longest };
}

export function measureChapter(chapterNumber: number, content: string): ChapterStyleMetrics {
  const body = stripCode(content || "");
  // `match` returns `RegExpMatchArray | null`. The `?? ([] as string[])`
  // fallback keeps the inferred element type as `string` (without the cast
  // TS would narrow the empty array to `never[]` and reduce() below would
  // infer the accumulator as `never`).
  const tokens = (body.match(WORD_RE) ?? ([] as string[]));
  const words = tokens.length;
  const sents = splitSentences(body);
  const paras = splitParagraphs(body);

  // Clichés
  const clicheMatches = body.match(CLICHE_RE) || [];
  const cliches = {
    count: clicheMatches.length,
    per_1k_words: words > 0 ? (clicheMatches.length * 1000) / words : 0,
    samples: Array.from(new Set(clicheMatches.map((m) => m.toLowerCase()))).slice(0, 6),
  };

  // Em-dashes (real em-dash and Claude's double-hyphen fallback)
  const emDashCount = (body.match(/—/g) || []).length;

  // Adverbs
  const adverbCount = tokens.filter(isAdverb).length;

  // Passive voice
  const passiveCount = sents.filter(isPassiveSentence).length;

  // Sentence starter repetition
  const { runs, longest } = starterRuns(sents);

  // Paragraph rhythm
  let walls = 0, fragments = 0;
  for (const p of paras) {
    const w = wordCount(p);
    if (w > 400) walls += 1;
    const s = splitSentences(p);
    if (s.length <= 2 && w < 80) fragments += 1;
  }
  const avgParaWords = paras.length > 0 ? words / paras.length : 0;
  const fragmentRate = paras.length > 0 ? fragments / paras.length : 0;

  // Reading-grade
  const syllables = tokens.reduce((n, t) => n + syllableCount(t), 0);
  const grade = fleschKincaidGrade(words, sents.length, syllables);

  return {
    chapter_number: chapterNumber,
    words, sentences: sents.length, paragraphs: paras.length,
    cliches,
    em_dashes: { count: emDashCount, per_1k_words: words > 0 ? (emDashCount * 1000) / words : 0 },
    adverbs: { count: adverbCount, rate: words > 0 ? adverbCount / words : 0 },
    passive: { count: passiveCount, rate: sents.length > 0 ? passiveCount / sents.length : 0 },
    starter_repetition: { runs, longest_run: longest },
    paragraph_rhythm: { avg_words: avgParaWords, walls, fragments, fragment_rate: fragmentRate },
    reading_grade: grade,
  };
}

// ─── Thresholds (publisher-grade) ──────────────────────────────────────────

export const STYLE_THRESHOLDS = {
  cliche_per_1k_warning: 2.0,
  cliche_per_1k_blocker: 5.0,
  em_dash_per_1k_warning: 8.0,
  em_dash_per_1k_blocker: 16.0,
  adverb_rate_warning: 0.03,
  adverb_rate_blocker: 0.06,
  passive_rate_warning: 0.20,
  passive_rate_blocker: 0.35,
  starter_runs_warning: 1,
  paragraph_walls_warning: 1,
  fragment_rate_warning: 0.40,
  reading_grade_variance_warning: 5, // FK grade std-dev across chapters
} as const;

// ─── Public surface ────────────────────────────────────────────────────────

export interface StyleReport {
  metrics: ChapterStyleMetrics[];
  totals: {
    words: number;
    cliche_total: number;
    cliche_per_1k_overall: number;
    em_dash_per_1k_overall: number;
    adverb_rate_overall: number;
    passive_rate_overall: number;
    reading_grade_mean: number;
    reading_grade_stddev: number;
  };
  issues: ContentIssue[];
}

export function auditBookStyle(
  chapters: Array<{ chapter_number: number; content: string | null }>,
): StyleReport {
  const metrics: ChapterStyleMetrics[] = [];
  const issues: ContentIssue[] = [];
  let totalWords = 0, totalCliches = 0, totalEmDash = 0, totalAdverbs = 0;
  let totalSentences = 0, totalPassive = 0;
  const grades: number[] = [];

  for (const ch of chapters) {
    const m = measureChapter(ch.chapter_number, ch.content ?? "");
    metrics.push(m);
    totalWords += m.words;
    totalCliches += m.cliches.count;
    totalEmDash += m.em_dashes.count;
    totalAdverbs += m.adverbs.count;
    totalSentences += m.sentences;
    totalPassive += m.passive.count;
    if (m.words > 100) grades.push(m.reading_grade);

    // Per-chapter issues
    if (m.cliches.per_1k_words >= STYLE_THRESHOLDS.cliche_per_1k_blocker) {
      issues.push({
        severity: "blocker", code: "cliche_density_high", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${m.cliches.count} cliché phrase${m.cliches.count === 1 ? "" : "s"} (${m.cliches.per_1k_words.toFixed(1)} / 1k words) — top: ${m.cliches.samples.slice(0, 3).join(", ")}`,
        hint: "Rewrite to replace LLM crutch phrases ('delve into', 'tapestry', etc.) with concrete language.",
      });
    } else if (m.cliches.per_1k_words >= STYLE_THRESHOLDS.cliche_per_1k_warning) {
      issues.push({
        severity: "warning", code: "cliche_density", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: cliché density ${m.cliches.per_1k_words.toFixed(1)} / 1k words — samples: ${m.cliches.samples.slice(0, 3).join(", ")}`,
        hint: "Consider replacing the flagged crutch phrases.",
      });
    }

    if (m.em_dashes.per_1k_words >= STYLE_THRESHOLDS.em_dash_per_1k_blocker) {
      issues.push({
        severity: "warning", code: "em_dash_overuse", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${m.em_dashes.count} em-dashes (${m.em_dashes.per_1k_words.toFixed(1)} / 1k words) — Claude's signature tell`,
        hint: "Replace 1-in-3 with commas or full stops; em-dash should be a flourish, not a rhythm.",
      });
    } else if (m.em_dashes.per_1k_words >= STYLE_THRESHOLDS.em_dash_per_1k_warning) {
      issues.push({
        severity: "info", code: "em_dash_density", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: em-dash density ${m.em_dashes.per_1k_words.toFixed(1)} / 1k words`,
      });
    }

    if (m.adverbs.rate >= STYLE_THRESHOLDS.adverb_rate_blocker) {
      issues.push({
        severity: "warning", code: "adverb_density_high", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${(m.adverbs.rate * 100).toFixed(1)}% adverb rate (${m.adverbs.count} -ly words / ${m.words})`,
        hint: "Strong verbs replace weak verb-plus-adverb pairs — 'shouted' beats 'said loudly'.",
      });
    } else if (m.adverbs.rate >= STYLE_THRESHOLDS.adverb_rate_warning) {
      issues.push({
        severity: "info", code: "adverb_density", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: adverb rate ${(m.adverbs.rate * 100).toFixed(1)}%`,
      });
    }

    if (m.passive.rate >= STYLE_THRESHOLDS.passive_rate_blocker) {
      issues.push({
        severity: "warning", code: "passive_voice_high", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${(m.passive.rate * 100).toFixed(0)}% sentences in passive voice`,
        hint: "Aim for ≤20%; convert passive constructions to active.",
      });
    } else if (m.passive.rate >= STYLE_THRESHOLDS.passive_rate_warning) {
      issues.push({
        severity: "info", code: "passive_voice", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: passive voice ${(m.passive.rate * 100).toFixed(0)}%`,
      });
    }

    if (m.starter_repetition.longest_run >= 4) {
      issues.push({
        severity: "warning", code: "starter_repetition", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${m.starter_repetition.longest_run} consecutive sentences with the same first word`,
        hint: "Vary sentence openers — readers hear the rhythm even when they don't notice it.",
      });
    } else if (m.starter_repetition.runs >= STYLE_THRESHOLDS.starter_runs_warning) {
      issues.push({
        severity: "info", code: "starter_repetition_minor", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${m.starter_repetition.runs} sentence-starter repetition run${m.starter_repetition.runs === 1 ? "" : "s"}`,
      });
    }

    if (m.paragraph_rhythm.walls >= STYLE_THRESHOLDS.paragraph_walls_warning) {
      issues.push({
        severity: "warning", code: "wall_of_text", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${m.paragraph_rhythm.walls} paragraph${m.paragraph_rhythm.walls === 1 ? "" : "s"} >400 words`,
        hint: "Break long paragraphs at natural beats — Kindle's small screens punish walls of text.",
      });
    }
    if (m.paragraph_rhythm.fragment_rate >= STYLE_THRESHOLDS.fragment_rate_warning && m.paragraphs >= 10) {
      issues.push({
        severity: "info", code: "fragment_rhythm", chapter: ch.chapter_number,
        message: `Chapter ${ch.chapter_number}: ${(m.paragraph_rhythm.fragment_rate * 100).toFixed(0)}% of paragraphs are ≤2 short sentences`,
        hint: "Mix in longer paragraphs so the prose breathes.",
      });
    }
  }

  // Cross-chapter: reading-grade variance
  let gradeMean = 0, gradeStd = 0;
  if (grades.length >= 2) {
    gradeMean = grades.reduce((a, b) => a + b, 0) / grades.length;
    const variance = grades.reduce((a, b) => a + (b - gradeMean) ** 2, 0) / grades.length;
    gradeStd = Math.sqrt(variance);
    if (gradeStd >= STYLE_THRESHOLDS.reading_grade_variance_warning) {
      issues.push({
        severity: "warning", code: "reading_grade_variance",
        message: `Reading grade swings ±${gradeStd.toFixed(1)} levels across chapters (mean grade ${gradeMean.toFixed(1)})`,
        hint: "Voice should stay consistent; tighten or expand outlier chapters to match.",
      });
    }
  }

  return {
    metrics,
    totals: {
      words: totalWords,
      cliche_total: totalCliches,
      cliche_per_1k_overall: totalWords > 0 ? (totalCliches * 1000) / totalWords : 0,
      em_dash_per_1k_overall: totalWords > 0 ? (totalEmDash * 1000) / totalWords : 0,
      adverb_rate_overall: totalWords > 0 ? totalAdverbs / totalWords : 0,
      passive_rate_overall: totalSentences > 0 ? totalPassive / totalSentences : 0,
      reading_grade_mean: gradeMean,
      reading_grade_stddev: gradeStd,
    },
    issues,
  };
}
