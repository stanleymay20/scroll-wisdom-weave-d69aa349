/**
 * useUsageSnapshot — fetches the user's current monthly usage from the secure
 * RPC `get_user_usage_snapshot`. Powers the Settings → Billing usage panel.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription";

export interface UsageSnapshot {
  plan: string;
  month: string;
  booksThisMonth: number;
  booksLimit: number | null;
  ttsMinutesUsed: number;
  ttsMinutesLimit: number | null;
  lastBookDate: string | null;
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
      const { data, error: rpcError } = await supabase.rpc("get_user_usage_snapshot", {
        _user_id: user.id,
      });
      if (rpcError) throw rpcError;
      const d = (data ?? {}) as Record<string, unknown>;
      const plan = (d.plan as string) || tier;
      const features = SUBSCRIPTION_TIERS[plan as keyof typeof SUBSCRIPTION_TIERS]?.features;
      setSnapshot({
        plan,
        month: (d.month as string) ?? new Date().toISOString().slice(0, 7),
        booksThisMonth: Number(d.books_this_month ?? 0),
        booksLimit: features?.maxBooksPerMonth ?? null,
        ttsMinutesUsed: Number(d.tts_minutes_used ?? 0),
        ttsMinutesLimit: features?.ttsMinutes ?? null,
        lastBookDate: (d.last_book_date as string) ?? null,
        generatedAt: (d.generated_at as string) ?? new Date().toISOString(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load usage";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user, tier]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
