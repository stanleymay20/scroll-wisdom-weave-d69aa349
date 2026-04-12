/**
 * Reading Funnel Analytics — Comprehensive event tracking
 * Tracks the full reading lifecycle for completion optimization.
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
  | 'stuck_reader_rescue';

interface FunnelEventMeta {
  bookId?: string;
  chapterId?: string;
  chapterNumber?: number;
  sectionIndex?: number;
  exitPoint?: number; // scroll % when user left
  sessionDurationSec?: number;
  sectionsCompleted?: number;
  rescueType?: string;
  sourceCard?: string;
  variant?: string;
  [key: string]: unknown;
}

/** Fire-and-forget event tracker — never blocks UX */
export async function trackFunnelEvent(
  eventType: FunnelEventType,
  meta: FunnelEventMeta = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: eventType,
      metadata: meta,
    });
  } catch {
    // Silent — never block UX for analytics
  }
}

/** Session-scoped accumulator for median sections per session */
let _sessionSections = 0;
let _sessionStart = Date.now();

export function resetSessionCounters() {
  _sessionSections = 0;
  _sessionStart = Date.now();
}

export function incrementSessionSections() {
  _sessionSections++;
}

export function getSessionStats() {
  return {
    sectionsCompleted: _sessionSections,
    durationSec: Math.round((Date.now() - _sessionStart) / 1000),
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
