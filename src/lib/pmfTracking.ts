/**
 * PMF Validation Event Tracking
 * 
 * Tracks key funnel events for 60-day PMF sprint:
 * - book_generated
 * - chapter_completed  
 * - quiz_completed
 * - certificate_issued
 * - second_book
 * - upgrade_clicked
 * - paid_conversion
 */

import { supabase } from "@/integrations/supabase/client";

export type PMFEventType = 
  | 'book_generated'
  | 'chapter_completed'
  | 'quiz_completed'
  | 'certificate_issued'
  | 'second_book'
  | 'upgrade_clicked'
  | 'paid_conversion';

export async function trackPMFEvent(
  eventType: PMFEventType,
  metadata: Record<string, unknown> = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: eventType,
      metadata,
    });
  } catch (error) {
    // Silent fail - never block UX for tracking
    console.debug('[PMF] Event track failed:', eventType, error);
  }
}

/**
 * Track book generation (call after successful generate-book)
 */
export async function trackBookGenerated(bookId: string, category: string) {
  // Check if this is user's second+ book
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { count } = await supabase
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  await trackPMFEvent('book_generated', { bookId, category });
  
  if (count && count >= 2) {
    await trackPMFEvent('second_book', { bookId, totalBooks: count });
  }
}
