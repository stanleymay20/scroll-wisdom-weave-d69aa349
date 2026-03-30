import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier, getTierFromProductId, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import { LAUNCH_MODE_CONFIG, isLaunchModeActive } from '@/lib/config';
import { getErrorMessageText, isTransientAuthError } from '@/lib/authResilience';

interface DailyLimitInfo {
  dailyBookCount: number;
  lastBookDate: string | null;
  canGenerateToday: boolean;
}

interface SubscriptionContextType {
  user: User | null;
  tier: SubscriptionTier;
  isSubscribed: boolean;
  subscriptionEnd: string | null;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  canGenerateBooks: boolean;
  maxWordCount: number;
  dailyLimitInfo: DailyLimitInfo;
  incrementDailyBookCount: () => Promise<void>;
  ttsMinutesUsed: number;
  updateTTSUsage: (minutes: number) => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dailyLimitInfo, setDailyLimitInfo] = useState<DailyLimitInfo>({
    dailyBookCount: 0,
    lastBookDate: null,
    canGenerateToday: true,
  });
  const [ttsMinutesUsed, setTtsMinutesUsed] = useState(0);

  const lastFetchRef = useRef<number>(0);
  const FETCH_COOLDOWN = 30000;

  const resetAnonymousState = useCallback(() => {
    setUser(null);
    setTier('free');
    setSubscriptionEnd(null);
    setIsLoading(false);
  }, []);

  const checkDailyLimits = useCallback(async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('daily_book_count, last_book_date')
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

      if (profile) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastDate = profile.last_book_date;
        const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
        const count = lastMonth === currentMonth ? (profile.daily_book_count || 0) : 0;
        const canGenerate = count < LAUNCH_MODE_CONFIG.freeBookLimit;

        setDailyLimitInfo({
          dailyBookCount: count,
          lastBookDate: lastDate,
          canGenerateToday: canGenerate,
        });
      }
    } catch (error) {
      console.error('Error checking daily limits:', error);
    }
  }, []);

  const checkTTSUsage = useCallback(async (userId: string) => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);

      const { data } = await supabase
        .from('tts_usage')
        .select('minutes_used')
        .eq('user_id', userId)
        .eq('month', currentMonth)
        .maybeSingle();

      if (data) {
        setTtsMinutesUsed(data.minutes_used);
      } else {
        setTtsMinutesUsed(0);
      }
    } catch (error) {
      console.error('Error checking TTS usage:', error);
    }
  }, []);

  const checkSubscription = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_COOLDOWN) {
      return;
    }
    lastFetchRef.current = now;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (isTransientAuthError(sessionError)) {
          console.warn('Transient getSession() error during subscription check; preserving auth state');
          setIsLoading(false);
          return;
        }

        console.warn('Session lookup failed during subscription check:', getErrorMessageText(sessionError));
        // Only reset if this is a forced (initial) check. Periodic checks should preserve state.
        if (force) resetAnonymousState();
        else setIsLoading(false);
        return;
      }

      if (!session?.user) {
        // CRITICAL FIX: If we already have a user in state, don't reset on periodic checks.
        // getSession() can return null transiently after background/tab switch before
        // autoRefreshToken kicks in. Only reset on forced bootstrap when we truly have no session.
        if (!force) {
          // Attempt a proactive refresh before giving up
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData?.session?.user) {
            setUser((prev) => (prev?.id === refreshData.session!.user.id ? prev : refreshData.session!.user));
            setIsLoading(false);
            // Continue to subscription check below won't work since we need to re-fetch.
            // Just return — next interval will pick it up.
            return;
          }
          // If refresh also failed and we have an existing user, preserve state
          if (user) {
            console.warn('Periodic check: no session but user exists in state — preserving');
            setIsLoading(false);
            return;
          }
        }
        resetAnonymousState();
        return;
      }

      setUser((prev) => (prev?.id === session.user.id ? prev : session.user));

      const [profileResult, subResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('daily_book_count, last_book_date, plan')
          .or(`user_id.eq.${session.user.id},id.eq.${session.user.id}`)
          .maybeSingle(),
        supabase.functions.invoke('check-subscription'),
      ]);

      if (profileResult.error) {
        console.warn('Profile fetch failed during subscription check:', profileResult.error.message);
      }

      const profileData = profileResult.data;
      if (profileData) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastDate = profileData.last_book_date;
        const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
        const count = lastMonth === currentMonth ? (profileData.daily_book_count || 0) : 0;

        setDailyLimitInfo({
          dailyBookCount: count,
          lastBookDate: lastDate,
          canGenerateToday: count < LAUNCH_MODE_CONFIG.freeBookLimit,
        });
      }

      void checkTTSUsage(session.user.id);

      const { data: subData, error: subError } = subResult;
      if (subError) {
        console.error('Error checking subscription:', subError);
        if (profileData?.plan) {
          setTier(profileData.plan as SubscriptionTier);
        }
        setIsLoading(false);
        return;
      }

      if (subData?.subscribed) {
        const detectedTier = subData.product_id
          ? getTierFromProductId(subData.product_id)
          : (subData.tier as SubscriptionTier) || 'free';
        setTier(detectedTier);
        setSubscriptionEnd(subData.subscription_end);

        const validPlans: SubscriptionTier[] = ['free', 'premium', 'prophet_tier', 'student'];
        const planToSave = validPlans.includes(detectedTier) ? detectedTier : 'premium';

        void supabase
          .from('profiles')
          .update({ plan: planToSave as 'free' | 'premium' | 'prophet_tier' | 'student' })
          .or(`user_id.eq.${session.user.id},id.eq.${session.user.id}`)
          .then(() => {});
      } else {
        setTier((profileData?.plan as SubscriptionTier) || 'free');
        setSubscriptionEnd(null);
      }
    } catch (error) {
      if (isTransientAuthError(error)) {
        console.warn('Transient subscription check error; preserving auth state');
      } else {
        console.error('Subscription check error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [checkTTSUsage, resetAnonymousState]);

  const incrementDailyBookCount = useCallback(async () => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);
    const lastMonth = dailyLimitInfo.lastBookDate ? dailyLimitInfo.lastBookDate.slice(0, 7) : null;
    const newCount = lastMonth === currentMonth ? dailyLimitInfo.dailyBookCount + 1 : 1;

    await supabase
      .from('profiles')
      .update({
        daily_book_count: newCount,
        last_book_date: today,
      })
      .or(`user_id.eq.${user.id},id.eq.${user.id}`);

    setDailyLimitInfo({
      dailyBookCount: newCount,
      lastBookDate: today,
      canGenerateToday: newCount < LAUNCH_MODE_CONFIG.freeBookLimit,
    });
  }, [user, dailyLimitInfo]);

  const updateTTSUsage = useCallback(async (minutes: number) => {
    if (!user) return;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const newTotal = ttsMinutesUsed + minutes;

    await supabase
      .from('tts_usage')
      .upsert(
        {
          user_id: user.id,
          month: currentMonth,
          minutes_used: newTotal,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,month',
        }
      );

    setTtsMinutesUsed(newTotal);
  }, [user, ttsMinutesUsed]);

  useEffect(() => {
    let mounted = true;

    const bootstrapAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          if (isTransientAuthError(error)) {
            console.warn('Transient bootstrap session error; preserving auth state');
            if (mounted) setIsLoading(false);
            return;
          }

          if (mounted) resetAnonymousState();
          return;
        }

        if (!session?.user) {
          if (mounted) resetAnonymousState();
          return;
        }

        const { error: userError } = await supabase.auth.getUser();
        if (userError) {
          const msg = userError.message?.toLowerCase() || '';
          
          // Only treat truly invalid/revoked tokens as hard rejections
          // "expired" is NOT a rejection — the refresh token can recover it
          const isHardRejection = (msg.includes('invalid') || msg.includes('not authorized') || msg.includes('session_not_found'))
            && !msg.includes('expired');
          
          if (isHardRejection) {
            console.warn('JWT hard-rejected by server, clearing session:', userError.message);
            await supabase.auth.signOut({ scope: 'local' });
            if (mounted) resetAnonymousState();
            return;
          }

          // For expired tokens, attempt an explicit refresh
          if (msg.includes('expired') || msg.includes('token')) {
            console.info('Token may be expired, attempting refresh...');
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshData.session) {
              const refreshMsg = refreshError?.message?.toLowerCase() || '';
              const isRefreshRejection = refreshMsg.includes('invalid') || refreshMsg.includes('not authorized') || refreshMsg.includes('session_not_found');
              if (isRefreshRejection) {
                console.warn('Refresh token also rejected, clearing session:', refreshError?.message);
                await supabase.auth.signOut({ scope: 'local' });
                if (mounted) resetAnonymousState();
                return;
              }
              // Transient refresh failure — keep existing session
              console.warn('Refresh failed transiently, keeping session:', refreshError?.message);
            } else {
              // Refresh succeeded — update user
              if (mounted) setUser(refreshData.session.user);
            }
          } else {
            console.warn('getUser() transient error, keeping session:', userError.message);
          }
        }

        if (mounted) {
          setUser(session.user);
          void checkSubscription(true);
        }
      } catch (error) {
        if (isTransientAuthError(error)) {
          console.warn('Network error during session validation — keeping existing session');
        } else {
          console.error('Unexpected bootstrap auth error:', error);
        }

        if (mounted) {
          const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          if (session?.user) {
            setUser(session.user);
            void checkSubscription(true);
          } else {
            resetAnonymousState();
          }
        }
      }
    };

    void bootstrapAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        resetAnonymousState();
        return;
      }

      if (event === 'TOKEN_REFRESHED' && !session) {
        setTimeout(async () => {
          const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          if (!mounted) return;

          if (data.session?.user) {
            setUser((prev) => (prev?.id === data.session?.user?.id ? prev : data.session.user));
            setTimeout(() => void checkSubscription(true), 0);
          } else {
            console.warn('TOKEN_REFRESHED yielded no session; preserving current auth state');
            setIsLoading(false);
          }
        }, 250);
        return;
      }

      if (!session?.user) {
        setIsLoading(false);
        return;
      }

      setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
      setTimeout(() => void checkSubscription(true), 0);
    });

    const interval = setInterval(() => void checkSubscription(false), 300000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [checkSubscription, resetAnonymousState]);

  const isSubscribed = tier !== 'free';

  const canGenerateBooks = (() => {
    if (SUBSCRIPTION_TIERS[tier].features.canGenerateBooks) {
      return true;
    }
    if (isLaunchModeActive() && tier === 'free' && dailyLimitInfo.canGenerateToday) {
      return true;
    }
    return false;
  })();

  const maxWordCount = (() => {
    if (isLaunchModeActive() && tier === 'free') {
      return LAUNCH_MODE_CONFIG.freeMaxWordCount;
    }
    return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
  })();

  return (
    <SubscriptionContext.Provider
      value={{
        user,
        tier,
        isSubscribed,
        subscriptionEnd,
        isLoading,
        checkSubscription,
        canGenerateBooks,
        maxWordCount,
        dailyLimitInfo,
        incrementDailyBookCount,
        ttsMinutesUsed,
        updateTTSUsage,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
