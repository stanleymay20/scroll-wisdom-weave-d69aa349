/**
 * Monthly usage snapshot for the economic billing catalogue.
 *
 * The database meter is authoritative. Plan limits come from the same frontend
 * catalogue used by pricing; CI checks keep it aligned with the server copy.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "@/lib/subscription";

export interface UsageSnapshot {
  plan: SubscriptionTier;
  month: string;
  booksThisMonth: number;
  booksLimit: number;
  aiTextWordsUsed: number;
  aiTextWordsLimit: number;
  visualCreditsUsed: number;
  visualCreditsLimit: number;
  audioCreditsUsed: number;
  audioCreditsLimit: number;
  generatedAt: string;
}

export function useUsageSnapshot() {
  const { user, tier } = useSubscription();
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // The new RPC lands with the economic-billing migration. Cast keeps the
      // client compatible until generated Supabase types are refreshed.
      const { data, error: rpcError } = await (supabase as any).rpc(
        "get_my_billing_usage_snapshot",
      );
      if (rpcError) throw rpcError;

      const d = (data ?? {}) as Record<string, unknown>;
      const features = SUBSCRIPTION_TIERS[tier].features;
      const extraText = Number(d.extra_ai_text_words ?? 0);
      const extraVisual = Number(d.extra_visual_credits ?? 0);
      const extraAudio = Number(d.extra_audio_credits ?? 0);

      setSnapshot({
        plan: tier,
        month: String(d.month ?? new Date().toISOString().slice(0, 7)),
        booksThisMonth: Number(d.books_used ?? 0),
        booksLimit: features.maxBooksPerMonth,
        aiTextWordsUsed: Number(d.ai_text_words_used ?? 0),
        aiTextWordsLimit: features.aiTextWordsPerMonth + extraText,
        visualCreditsUsed: Number(d.visual_credits_used ?? 0),
        visualCreditsLimit: features.visualCredits + extraVisual,
        audioCreditsUsed: Number(d.audio_credits_used ?? 0),
        audioCreditsLimit: features.audioCredits + extraAudio,
        generatedAt: String(d.generated_at ?? new Date().toISOString()),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, [user, tier]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
