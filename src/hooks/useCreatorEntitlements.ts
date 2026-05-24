import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CreatorEntitlements {
  user_id: string;
  tier: "free" | "creator" | "creator_pro";
  can_publish_external: boolean;
  can_schedule_releases: boolean;
  can_use_collections_unlimited: boolean;
  priority_generation: boolean;
  monthly_generation_bonus: number;
  rev_share_surcharge_bps: number;
  source: string;
  expires_at: string | null;
  is_default: boolean;
}

const FREE_DEFAULT: CreatorEntitlements = {
  user_id: "",
  tier: "free",
  can_publish_external: false,
  can_schedule_releases: false,
  can_use_collections_unlimited: false,
  priority_generation: false,
  monthly_generation_bonus: 0,
  rev_share_surcharge_bps: 1000,
  source: "default",
  expires_at: null,
  is_default: true,
};

export function useCreatorEntitlements() {
  const [entitlements, setEntitlements] = useState<CreatorEntitlements>(FREE_DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setEntitlements(FREE_DEFAULT); return; }
      const { data, error } = await supabase.functions.invoke("get-entitlements");
      if (error || !data) { setEntitlements(FREE_DEFAULT); return; }
      setEntitlements({ ...FREE_DEFAULT, ...(data as Partial<CreatorEntitlements>) });
    } catch {
      setEntitlements(FREE_DEFAULT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { entitlements, loading, refresh, isCreator: entitlements.tier !== "free" };
}
