import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Cache admin status to prevent repeated queries
const adminCache = new Map<string, { isAdmin: boolean; timestamp: number }>();
const CACHE_DURATION = 300000; // 5 minutes

// Global function to clear admin cache (call after claiming admin)
export function clearAdminCache(userId?: string) {
  if (userId) {
    adminCache.delete(userId);
  } else {
    adminCache.clear();
  }
}

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useSubscription();
  const checkedRef = useRef(false);

  const recheckAdmin = useCallback(async () => {
    if (!user?.id) return;
    
    // Clear cache and recheck
    clearAdminCache(user.id);
    checkedRef.current = false;
    
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!error) {
        const adminStatus = !!data;
        setIsAdmin(adminStatus);
        adminCache.set(user.id, { isAdmin: adminStatus, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('Admin recheck failed:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    async function checkAdminRole() {
      if (!user?.id) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      // Check cache first
      const cached = adminCache.get(user.id);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setIsAdmin(cached.isAdmin);
        setIsLoading(false);
        return;
      }

      // Prevent duplicate checks in same render cycle
      if (checkedRef.current) return;
      checkedRef.current = true;

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (error) {
          console.error('Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          const adminStatus = !!data;
          setIsAdmin(adminStatus);
          // Cache the result
          adminCache.set(user.id, { isAdmin: adminStatus, timestamp: Date.now() });
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
        checkedRef.current = false;
      }
    }

    checkAdminRole();
  }, [user?.id]);

  return { isAdmin, isLoading, recheckAdmin };
}
