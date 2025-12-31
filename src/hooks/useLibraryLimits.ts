import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getLibraryLimit, canAddToLibrary, getRemainingLibrarySlots } from "@/lib/libraryLimits";

interface LibraryLimits {
  currentCount: number;
  maxLimit: number;
  remaining: number;
  canAdd: boolean;
  isUnlimited: boolean;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook to manage library limits based on subscription tier.
 * Checks user roles for admin override.
 */
export function useLibraryLimits(): LibraryLimits {
  const { tier, user } = useSubscription();
  const [currentCount, setCurrentCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLibraryCount = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Get library count
      const { count, error: countError } = await supabase
        .from("user_library")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) throw countError;
      setCurrentCount(count || 0);

      // Check if user is admin
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (!rolesError && roles) {
        setIsAdmin(roles.some(r => r.role === 'admin'));
      }
    } catch (error) {
      console.error("Error fetching library limits:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLibraryCount();
  }, [fetchLibraryCount]);

  const maxLimit = getLibraryLimit(tier);
  const isUnlimited = isAdmin || maxLimit === -1;
  const remaining = isUnlimited ? -1 : getRemainingLibrarySlots(tier, currentCount);
  const canAdd = isAdmin || canAddToLibrary(tier, currentCount);

  return {
    currentCount,
    maxLimit,
    remaining,
    canAdd,
    isUnlimited,
    isAdmin,
    loading,
    refresh: fetchLibraryCount
  };
}
