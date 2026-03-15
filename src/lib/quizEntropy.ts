/**
 * Quiz Entropy Engine — Anti-repetition & diversity scoring
 * 
 * Tracks recent question history per user/book, computes entropy scores,
 * and filters/rejects repetitive questions across both graph-driven and standard sources.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────

export interface QuestionFingerprint {
  conceptPairKey: string;      // sorted concept IDs joined
  sourceConceptIds: string[];
  sourceChapters: number[];
  questionType: string;
  bloomLevel: string;
  relationshipTypes: string[];
  isGraphDriven: boolean;
  questionHash: string;        // short hash of question text
}

export interface EntropyScore {
  overall: number;            // 0-100, higher = more diverse
  questionTypeDiversity: number;
  chapterDiversity: number;
  relationshipDiversity: number;
  weakStrongMix: number;
  belowThreshold: boolean;
  details: string;
}

interface HistoryRecord {
  concept_pair_key: string;
  source_chapters: number[];
  question_type: string;
  bloom_level: string;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────

const HISTORY_WINDOW_HOURS = 24;
const MAX_HISTORY_RECORDS = 100;
const ENTROPY_THRESHOLD = 45; // below this, partial regeneration is triggered
const CONCEPT_PAIR_COOLDOWN_HOURS = 4; // same pair can't repeat within this window

// ─── Fingerprinting ─────────────────────────────────────────

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function createFingerprint(question: any): QuestionFingerprint {
  const conceptIds = [
    ...(question.sourceConceptIds || []),
    ...(question.conceptsUsed || []),
  ].filter(Boolean);

  const sorted = [...new Set(conceptIds)].sort();
  const pairKey = sorted.slice(0, 4).join('|') || question.questionType || 'unknown';

  return {
    conceptPairKey: pairKey,
    sourceConceptIds: sorted,
    sourceChapters: question.sourceChapters || [],
    questionType: question.questionType || 'unknown',
    bloomLevel: question.bloomLevel || 'analyze',
    relationshipTypes: question.relationshipTypes || [],
    isGraphDriven: !!question.isGraphDriven,
    questionHash: simpleHash(question.question || ''),
  };
}

// ─── History Fetching ───────────────────────────────────────

export async function fetchRecentHistory(
  userId: string,
  bookId: string,
  windowHours = HISTORY_WINDOW_HOURS
): Promise<HistoryRecord[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('quiz_question_history')
    .select('concept_pair_key, source_chapters, question_type, bloom_level, created_at')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_RECORDS);

  return (data || []) as HistoryRecord[];
}

// ─── Recording ──────────────────────────────────────────────

export async function recordQuestionHistory(
  userId: string,
  bookId: string,
  questions: any[]
): Promise<void> {
  const records = questions.map((q) => {
    const fp = createFingerprint(q);
    return {
      user_id: userId,
      book_id: bookId,
      concept_pair_key: fp.conceptPairKey,
      source_concept_ids: fp.sourceConceptIds,
      source_chapters: fp.sourceChapters,
      question_type: fp.questionType,
      bloom_level: fp.bloomLevel,
      relationship_types: fp.relationshipTypes,
      is_graph_driven: fp.isGraphDriven,
      question_hash: fp.questionHash,
    };
  });

  if (records.length > 0) {
    await supabase.from('quiz_question_history').insert(records);
  }
}

// ─── Dedup / Down-ranking ───────────────────────────────────

export interface DedupResult {
  accepted: any[];
  rejected: any[];
  replacementNeeded: number;
}

export function deduplicateQuestions(
  questions: any[],
  history: HistoryRecord[],
  cooldownHours = CONCEPT_PAIR_COOLDOWN_HOURS
): DedupResult {
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const now = Date.now();

  // Build set of recently used pair keys within cooldown
  const recentPairKeys = new Set<string>();
  const recentTypeCount = new Map<string, number>();

  for (const h of history) {
    const age = now - new Date(h.created_at).getTime();
    if (age < cooldownMs) {
      recentPairKeys.add(h.concept_pair_key);
    }
    recentTypeCount.set(h.question_type, (recentTypeCount.get(h.question_type) || 0) + 1);
  }

  const accepted: any[] = [];
  const rejected: any[] = [];

  for (const q of questions) {
    const fp = createFingerprint(q);

    // Reject if exact concept pair was used recently
    if (recentPairKeys.has(fp.conceptPairKey)) {
      rejected.push(q);
      continue;
    }

    // Down-rank if same question type was used more than 3 times recently
    const typeCount = recentTypeCount.get(fp.questionType) || 0;
    if (typeCount >= 3 && accepted.length > 0) {
      // Move to end of accepted (down-ranked, not rejected)
      accepted.push({ ...q, _downRanked: true });
      continue;
    }

    accepted.push(q);
  }

  return {
    accepted,
    rejected,
    replacementNeeded: rejected.length,
  };
}

// ─── Entropy Scoring ────────────────────────────────────────

export function computeEntropyScore(
  questions: any[],
  weakConceptIds?: Set<string>
): EntropyScore {
  if (questions.length === 0) {
    return { overall: 0, questionTypeDiversity: 0, chapterDiversity: 0, relationshipDiversity: 0, weakStrongMix: 0, belowThreshold: true, details: 'No questions' };
  }

  // 1. Question type diversity (Shannon entropy normalized)
  const typeCounts = new Map<string, number>();
  for (const q of questions) {
    const t = q.questionType || 'unknown';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const typeEntropy = shannonEntropy(typeCounts, questions.length);
  const maxTypeEntropy = Math.log2(Math.min(typeCounts.size + 2, 8)); // theoretical max
  const questionTypeDiversity = maxTypeEntropy > 0 ? Math.min(100, (typeEntropy / maxTypeEntropy) * 100) : 50;

  // 2. Chapter diversity
  const allChapters = new Set<number>();
  for (const q of questions) {
    (q.sourceChapters || []).forEach((c: number) => allChapters.add(c));
  }
  const chapterDiversity = Math.min(100, allChapters.size * 25); // 4+ chapters = 100

  // 3. Relationship type diversity
  const relTypes = new Set<string>();
  for (const q of questions) {
    (q.relationshipTypes || []).forEach((r: string) => relTypes.add(r));
    if (q.questionType) relTypes.add(q.questionType);
  }
  const relationshipDiversity = Math.min(100, relTypes.size * 20); // 5+ = 100

  // 4. Weak vs strong concept mix
  let weakCount = 0;
  let strongCount = 0;
  if (weakConceptIds && weakConceptIds.size > 0) {
    for (const q of questions) {
      const concepts = q.sourceConceptIds || q.conceptsUsed || [];
      const hasWeak = concepts.some((c: string) => weakConceptIds.has(c));
      if (hasWeak) weakCount++;
      else strongCount++;
    }
  }
  // Ideal mix: 40-60% weak concepts
  const weakRatio = questions.length > 0 ? weakCount / questions.length : 0.5;
  const weakStrongMix = weakConceptIds && weakConceptIds.size > 0
    ? Math.max(0, 100 - Math.abs(weakRatio - 0.5) * 200)
    : 50; // neutral if no learner data

  // 5. Bloom level diversity
  const bloomCounts = new Map<string, number>();
  for (const q of questions) {
    const b = q.bloomLevel || 'analyze';
    bloomCounts.set(b, (bloomCounts.get(b) || 0) + 1);
  }
  const bloomEntropy = shannonEntropy(bloomCounts, questions.length);
  const bloomBonus = Math.min(20, bloomEntropy * 10);

  const overall = Math.round(
    questionTypeDiversity * 0.30 +
    chapterDiversity * 0.25 +
    relationshipDiversity * 0.20 +
    weakStrongMix * 0.15 +
    bloomBonus * 0.10 / 0.10 * 0.10 // normalize
  );

  const belowThreshold = overall < ENTROPY_THRESHOLD;

  return {
    overall,
    questionTypeDiversity: Math.round(questionTypeDiversity),
    chapterDiversity: Math.round(chapterDiversity),
    relationshipDiversity: Math.round(relationshipDiversity),
    weakStrongMix: Math.round(weakStrongMix),
    belowThreshold,
    details: belowThreshold
      ? `Low entropy (${overall}): ${questionTypeDiversity < 40 ? 'question types too similar; ' : ''}${chapterDiversity < 40 ? 'chapters not diverse; ' : ''}${weakStrongMix < 30 ? 'weak/strong imbalance; ' : ''}`
      : `Good entropy (${overall})`,
  };
}

function shannonEntropy(counts: Map<string, number>, total: number): number {
  let entropy = 0;
  for (const count of counts.values()) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ─── Full Pipeline ──────────────────────────────────────────

export interface EntropyPipelineResult {
  questions: any[];
  entropy: EntropyScore;
  dedupStats: { rejected: number; downRanked: number };
  historyRecorded: boolean;
}

export async function runEntropyPipeline(
  userId: string,
  bookId: string,
  allQuestions: any[],
  weakConceptIds?: Set<string>
): Promise<EntropyPipelineResult> {
  // 1. Fetch recent history
  const history = await fetchRecentHistory(userId, bookId);

  // 2. Dedup against history
  const { accepted, rejected } = deduplicateQuestions(allQuestions, history);
  const downRanked = accepted.filter((q: any) => q._downRanked).length;

  // Clean _downRanked flag
  const cleaned = accepted.map((q: any) => {
    const { _downRanked, ...rest } = q;
    return rest;
  });

  // 3. Compute entropy
  const entropy = computeEntropyScore(cleaned, weakConceptIds);

  // 4. Record history (async, don't block)
  let historyRecorded = false;
  if (cleaned.length > 0) {
    try {
      await recordQuestionHistory(userId, bookId, cleaned);
      historyRecorded = true;
    } catch {
      // Silent — history recording is non-critical
    }
  }

  return {
    questions: cleaned,
    entropy,
    dedupStats: { rejected: rejected.length, downRanked },
    historyRecorded,
  };
}
