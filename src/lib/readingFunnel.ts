/**
 * Reading Funnel Analytics — Comprehensive event tracking
 * Tracks the full reading lifecycle for completion optimization.
 * 
 * v2: Cached userId, proper section counting, batch-safe.
 */

import { supabase } from "@/integrations/supabase/client";

export type FunnelEventType =
  | 'book_opened'
  | 'chapter_started'
  | 'section_completed'
  | 'chapter_completed'
  | 'book_completed'
  | 'returned_within_24h'
  | 'resumed_from_banner'
  | 'quicklearn_to_reader_click'
  | 'tts_started'
  | 'tts_completed_section'
  | 'guided_mode_used'
  | 'chapter_exit'
  | 'stuck_reader_rescue'
  | 'chapter_1_completed'
  | 'chapter_2_started'
  | 'first_section_completed'
  | 'post_chapter_cta_quiz'
  | 'post_chapter_cta_flashcards'
  | 'post_chapter_cta_continue';

interface FunnelEventMeta {
  bookId?: string;
  chapterId?: string;
  chapterNumber?: number;
  sectionIndex?: number;
  exitPoint?: number;
  sessionDurationSec?: number;
  sectionsCompleted?: number;
  rescueType?: string;
  sourceCard?: string;
  variant?: string;
  completionReason?: string;
  completionConfidence?: string;
  [key: string]: unknown;
}

// === Cached user ID to avoid repeated auth calls ===
let _cachedUserId: string | null = null;
let _userIdFetchedAt = 0;
const USER_CACHE_TTL = 60_000; // 1 minute

async function getCachedUserId(): Promise<string | null> {
  const now = Date.now();
  if (_cachedUserId && now - _userIdFetchedAt < USER_CACHE_TTL) {
    return _cachedUserId;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    _cachedUserId = user?.id ?? null;
    _userIdFetchedAt = now;
    return _cachedUserId;
  } catch {
    return null;
  }
}

// Clear cache on auth state change
supabase.auth.onAuthStateChange(() => {
  _cachedUserId = null;
  _userIdFetchedAt = 0;
});

/** Fire-and-forget event tracker — never blocks UX */
export async function trackFunnelEvent(
  eventType: FunnelEventType,
  meta: FunnelEventMeta = {}
) {
  try {
    const userId = await getCachedUserId();
    if (!userId) return;

    await supabase.from('pmf_events' as any).insert({
      user_id: userId,
      event_type: eventType,
      metadata: {
        ...meta,
        sessionDurationSec: meta.sessionDurationSec ?? getSessionStats().durationSec,
        timestamp: Date.now(),
      },
    });
  } catch {
    // Silent — never block UX for analytics
  }
}

/** Session-scoped accumulator for sections per session */
let _sessionSections = 0;
let _sessionStart = Date.now();
let _sectionEvents: Array<{ index: number; timestamp: number; reason: string }> = [];

export function resetSessionCounters() {
  _sessionSections = 0;
  _sessionStart = Date.now();
  _sectionEvents = [];
}

export function incrementSessionSections(sectionIndex?: number, reason?: string) {
  _sessionSections++;
  _sectionEvents.push({
    index: sectionIndex ?? _sessionSections - 1,
    timestamp: Date.now(),
    reason: reason ?? 'unknown',
  });
}

export function getSessionStats() {
  return {
    sectionsCompleted: _sessionSections,
    durationSec: Math.round((Date.now() - _sessionStart) / 1000),
    sectionEvents: _sectionEvents,
  };
}

/** Track chapter exit with context */
export function trackChapterExit(bookId: string, chapterNumber: number, scrollPercent: number) {
  const stats = getSessionStats();
  trackFunnelEvent('chapter_exit', {
    bookId,
    chapterNumber,
    exitPoint: Math.round(scrollPercent),
    sessionDurationSec: stats.durationSec,
    sectionsCompleted: stats.sectionsCompleted,
  });
}

/** Track section completion with reason from heuristic */
export function trackSectionCompleted(
  bookId: string,
  chapterNumber: number,
  sectionIndex: number,
  reason: string,
  confidence: string
) {
  incrementSessionSections(sectionIndex, reason);
  trackFunnelEvent('section_completed', {
    bookId,
    chapterNumber,
    sectionIndex,
    completionReason: reason,
    completionConfidence: confidence,
  });
}
