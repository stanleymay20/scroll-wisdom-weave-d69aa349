/**
 * PMF Validation Event Tracking
 *
 * Tracks key funnel events for the PMF/GA funnel and relays the same event
 * asynchronously to ScrollMarketer when the server-side bridge is configured.
 *
 * ScrollMarketer receives only a pseudonymous user key and allowlisted metadata;
 * raw user IDs, email addresses and manuscript content never leave ScrollLibrary.
 */

import { supabase } from "@/integrations/supabase/client";
import { getAttributionContext } from "@/lib/attribution";

export type PMFEventType =
  | 'book_generated'
  | 'chapter_completed'
  | 'quiz_completed'
  | 'certificate_issued'
  | 'second_book'
  | 'upgrade_clicked'
  | 'paid_conversion';

export function relayPMFEvent(
  eventType: PMFEventType,
  metadata: Record<string, unknown>,
) {
  try {
    const attribution =
      typeof window !== "undefined" ? getAttributionContext() : undefined;

    // Deliberately fire-and-forget. Growth telemetry must never become a
    // product availability dependency.
    void supabase.functions.invoke("relay-growth-event", {
      body: { eventType, metadata, attribution },
    }).then(({ error }) => {
      if (error) {
        console.debug("[PMF] Growth relay skipped:", eventType, error.message);
      }
    }).catch((error) => {
      console.debug("[PMF] Growth relay failed:", eventType, error);
    });
  } catch (error) {
    console.debug("[PMF] Growth relay setup failed:", eventType, error);
  }
}

export async function trackPMFEvent(
  eventType: PMFEventType,
  metadata: Record<string, unknown> = {}
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('pmf_events' as any).insert({
      user_id: user.id,
      event_type: eventType,
      metadata,
    });

    if (error) {
      console.debug('[PMF] Event insert failed:', eventType, error.message);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sl_analytics", {
        detail: { event: `pmf:${eventType}` },
      }));
    }

    relayPMFEvent(eventType, metadata);
  } catch (error) {
    // Silent fail - never block UX for tracking
    console.debug('[PMF] Event track failed:', eventType, error);
  }
}

/**
 * Track book generation (call after successful generate-book).
 * Book IDs remain inside ScrollLibrary; the growth bridge strips them.
 */
export async function trackBookGenerated(bookId: string, category: string) {
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
