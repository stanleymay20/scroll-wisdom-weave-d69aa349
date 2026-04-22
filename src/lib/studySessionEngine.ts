/**
 * Deep Study Mode — Session Engine
 * =================================
 * Computes the daily session plan from existing tables (no schema changes):
 *  - Warm-up: SRS cards due today (spaced_repetition_cards)
 *  - Focus:   most recent in-progress book/chapter (user_library)
 *  - Retrieval: weakest concepts for the session book (learner_concept_states + concept_nodes)
 *  - Reflection: one open prompt scored by AI (uses grade-think-answer edge)
 *
 * The plan is deterministic for a given user/day so the dashboard CTA and
 * /study agree on what's queued.
 */

import { supabase } from '@/integrations/supabase/client';

export type SessionPhase = 'intro' | 'warmup' | 'focus' | 'retrieval' | 'reflection' | 'report';

export interface SessionPlan {
  // Primary book the session is built around (the resume book, or first SRS card's book)
  bookId: string | null;
  bookTitle: string | null;
  resumeChapter: number;

  // Warm-up
  dueCardCount: number;
  warmupTargetCards: number; // capped at 3

  // Retrieval
  weakConcepts: Array<{ id: string; label: string; mastery: number }>;
  retrievalQuestionCount: number; // capped at 3

  // Suggested timings (minutes)
  warmupMinutes: number;
  focusMinutes: number;
  retrievalMinutes: number;
  reflectionMinutes: number;

  // Empty-state hint
  isEmpty: boolean;
}

const DEFAULT_PLAN: SessionPlan = {
  bookId: null,
  bookTitle: null,
  resumeChapter: 1,
  dueCardCount: 0,
  warmupTargetCards: 0,
  weakConcepts: [],
  retrievalQuestionCount: 0,
  warmupMinutes: 2,
  focusMinutes: 15,
  retrievalMinutes: 5,
  reflectionMinutes: 3,
  isEmpty: true,
};

/**
 * Build today's session plan for a user.
 * Pure orchestration over existing tables — does not write anything.
 */
export async function buildSessionPlan(userId: string): Promise<SessionPlan> {
  if (!userId) return DEFAULT_PLAN;

  const nowIso = new Date().toISOString();

  // --- 1. Find the "session book" --------------------------------------
  // Priority: most recent in-progress book; fallback to first SRS card's book.
  let bookId: string | null = null;
  let bookTitle: string | null = null;
  let resumeChapter = 1;

  const { data: library } = await supabase
    .from('user_library')
    .select('book_id, last_read_chapter, updated_at, progress_percent')
    .eq('user_id', userId)
    .gt('progress_percent', 0)
    .lt('progress_percent', 100)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (library && library.length > 0) {
    bookId = library[0].book_id;
    resumeChapter = library[0].last_read_chapter || 1;
  }

  // --- 2. Warm-up: SRS cards due today --------------------------------
  const { data: dueCards } = await supabase
    .from('spaced_repetition_cards')
    .select('id, book_id')
    .eq('user_id', userId)
    .lte('next_review_at', nowIso)
    .limit(50);

  const dueCardCount = dueCards?.length ?? 0;

  // If no in-progress book but there are due cards, pivot to that book
  if (!bookId && dueCards && dueCards.length > 0) {
    bookId = dueCards[0].book_id;
  }

  // --- 3. Resolve book title ------------------------------------------
  if (bookId) {
    const { data: book } = await supabase
      .from('books')
      .select('title')
      .eq('id', bookId)
      .maybeSingle();
    bookTitle = book?.title ?? null;
  }

  // --- 4. Retrieval: weakest concepts for this book --------------------
  let weakConcepts: SessionPlan['weakConcepts'] = [];
  if (bookId) {
    const { data: states } = await supabase
      .from('learner_concept_states')
      .select('mastery_score, concept_node_id, concept_nodes!inner(label, book_id)')
      .eq('user_id', userId)
      .eq('concept_nodes.book_id', bookId)
      .order('mastery_score', { ascending: true })
      .limit(8);

    weakConcepts = (states ?? [])
      .map((s: any) => ({
        id: s.concept_node_id,
        label: s.concept_nodes?.label ?? 'Concept',
        mastery: Number(s.mastery_score) || 0,
      }))
      .slice(0, 3);
  }

  const isEmpty = !bookId && dueCardCount === 0;

  return {
    bookId,
    bookTitle,
    resumeChapter,
    dueCardCount,
    warmupTargetCards: Math.min(3, dueCardCount),
    weakConcepts,
    retrievalQuestionCount: Math.min(3, Math.max(weakConcepts.length, 3)),
    warmupMinutes: dueCardCount > 0 ? 2 : 0,
    focusMinutes: bookId ? 15 : 0,
    retrievalMinutes: bookId ? 5 : 0,
    reflectionMinutes: 3,
    isEmpty,
  };
}

/**
 * Cognitive report card aggregation — read from existing tables.
 * Returns deltas accumulated *during* a session window (since `sessionStart`).
 */
export interface SessionReport {
  cardsReviewed: number;
  conceptsStrengthened: number;
  focusMinutes: number;
  masteryDelta: number;
  reflectionScore: number | null;
}

export async function computeSessionReport(
  userId: string,
  sessionStart: Date,
  payload: {
    cardsReviewed: number;
    focusMinutes: number;
    retrievalScore: number; // 0..1
    reflectionScore: number | null; // 1..5 or null
    weakConceptsTouched: number;
  },
): Promise<SessionReport> {
  // Mastery delta is approximated locally to keep the report instant —
  // the underlying tables update asynchronously through quiz/SRS flows.
  const masteryDelta =
    Math.round(
      payload.cardsReviewed * 4 +
        payload.weakConceptsTouched * 6 +
        payload.retrievalScore * 20 +
        (payload.reflectionScore ? payload.reflectionScore * 3 : 0),
    );

  return {
    cardsReviewed: payload.cardsReviewed,
    conceptsStrengthened: payload.weakConceptsTouched,
    focusMinutes: Math.round(payload.focusMinutes),
    masteryDelta,
    reflectionScore: payload.reflectionScore,
  };
}
