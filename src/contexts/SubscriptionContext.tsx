import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier, getTierFromProductId, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import { LAUNCH_MODE_CONFIG, isLaunchModeActive } from '@/lib/config';
import { getErrorMessageText, isTransientAuthError, withTransientRetry } from '@/lib/authResilience';

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
  checkSubscription: (force?: boolean) => Promise<void>;
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
  const userRef = useRef<User | null>(null);
  const FETCH_COOLDOWN = 30000;
  const authRevisionRef = useRef(0);
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const resetAnonymousState = useCallback(() => {
    setUser(null);
    userRef.current = null;
    authRevisionRef.current += 1;
    requestRef.current += 1;
    lastFetchRef.current = 0;
    inFlightRef.current = null;
    setTier('free');
    setSubscriptionEnd(null);
    setDailyLimitInfo({ dailyBookCount: 0, lastBookDate: null, canGenerateToday: true });
    setTtsMinutesUsed(0);
    setIsLoading(false);
  }, []);

  const checkDailyLimits = useCallback(async (userId: string) => {
    const revision = authRevisionRef.current;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('daily_book_count, last_book_date')
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

      if (mountedRef.current && authRevisionRef.current === revision && userRef.current?.id === userId && profile) {
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
    const revision = authRevisionRef.current;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);

      const { data } = await supabase
        .from('tts_usage')
        .select('minutes_used')
        .eq('user_id', userId)
        .eq('month', currentMonth)
        .maybeSingle();

      if (!mountedRef.current || authRevisionRef.current !== revision || userRef.current?.id !== userId) return;
      if (data) {
        setTtsMinutesUsed(data.minutes_used);
      } else {
        setTtsMinutesUsed(0);
      }
    } catch (error) {
      console.error('Error checking TTS usage:', error);
    }
  }, []);

  // Identity comes only from auth events/bootstrap. Billing cannot sign a user in or out.
  const checkSubscription = useCallback(async (force = false) => {
    const currentUser = userRef.current;
    if (!currentUser || !mountedRef.current) return;
    if (inFlightRef.current) return inFlightRef.current;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_COOLDOWN) return;
    lastFetchRef.current = now;
    const revision = authRevisionRef.current;
    const request = ++requestRef.current;
    const isCurrent = () => mountedRef.current && authRevisionRef.current === revision &&
      requestRef.current === request && userRef.current?.id === currentUser.id;
    const session = { user: currentUser };
    const work = (async () => {
      try {
        const profilePromise = withTransientRetry(() => Promise.resolve(
          supabase
            .from('profiles')
            .select('daily_book_count, last_book_date, plan')
            .or(`user_id.eq.${session.user.id},id.eq.${session.user.id}`)
            .maybeSingle()
            .then((res) => {
              if (res.error && isTransientAuthError(res.error)) throw res.error;
              return res;
            })
        ), 2, 600).catch((err) => ({ data: null, error: err as any }));

        const subPromise = withTransientRetry(() => Promise.resolve(
          supabase.functions.invoke('check-subscription').then((res) => {
            if (res.error && isTransientAuthError(res.error)) throw res.error;
            return res;
          })
        ), 2, 600).catch((err) => ({ data: null, error: err as any }));

        const [profileResult, subResult] = await Promise.all([profilePromise, subPromise]);

        if (!isCurrent()) return;

        if (profileResult.error) {
          console.warn('Profile fetch failed during subscription check:', getErrorMessageText(profileResult.error));
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
          if (isTransientAuthError(subError)) {
            console.warn('Transient subscription check failure; falling back to profile plan');
          } else {
            console.error('Error checking subscription:', subError);
          }
          if (profileData?.plan) {
            setTier(profileData.plan as SubscriptionTier);
          }
          return;
        }

        if (subData?.subscribed) {
          const detectedTier = subData.product_id
            ? getTierFromProductId(subData.product_id)
            : (subData.tier as SubscriptionTier) || 'free';
          setTier(detectedTier);
          setSubscriptionEnd(subData.subscription_end);
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
        if (isCurrent()) inFlightRef.current = null;
      }
    })();
    inFlightRef.current = work;
    return work;
  }, [checkTTSUsage]);

  const incrementDailyBookCount = useCallback(async () => {
    if (!user) return;

    // Generation counters are server-owned. The generate-book Edge Function has
    // already persisted the authoritative increment; the browser only refreshes.
    await checkDailyLimits(user.id);
  }, [user, checkDailyLimits]);

  const updateTTSUsage = useCallback(async (_minutes: number) => {
    if (!user) return;

    // TTS usage is reserved and persisted by the server before provider access.
    // The browser only refreshes the canonical value after a successful chunk.
    await checkTTSUsage(user.id);
  }, [user, checkTTSUsage]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const acceptSession = (nextUser: User | null) => {
      if (!mounted) return;
      if (!nextUser) {
        resetAnonymousState();
        return;
      }
      if (userRef.current?.id !== nextUser.id) {
        resetAnonymousState();
      }
      userRef.current = nextUser;
      setUser(nextUser);
      // Protected routes must not wait on profiles, Stripe, or usage requests.
      setIsLoading(false);
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (mounted) void checkSubscription(true);
      }, 0);
      timers.add(timer);
    };
    // Subscribe before reading: a late bootstrap must never resurrect a signed-out user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      authRevisionRef.current += 1;
      requestRef.current += 1;
      inFlightRef.current = null;
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION' || session?.user) {
        acceptSession(session?.user ?? null);
      }
    });
    const bootstrapRevision = authRevisionRef.current;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authRevisionRef.current !== bootstrapRevision) return;
      if (error) {
        console.warn('Initial session lookup failed:', getErrorMessageText(error));
        setIsLoading(false);
        return;
      }
      acceptSession(data.session?.user ?? null);
    }).catch((error: unknown) => {
      if (!mounted || authRevisionRef.current !== bootstrapRevision) return;
      console.warn('Initial session lookup failed:', getErrorMessageText(error));
      setIsLoading(false);
    });

    // The SDK owns token refresh and cross-tab auth. These hooks refresh billing only.
    const recheck = () => {
      if (document.visibilityState === 'visible') void checkSubscription(false);
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('online', recheck);
    const interval = setInterval(() => void checkSubscription(false), 300000);
    return () => {
      mounted = false;
      mountedRef.current = false;
      authRevisionRef.current += 1;
      requestRef.current += 1;
      inFlightRef.current = null;
      subscription.unsubscribe();
      timers.forEach(clearTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('online', recheck);
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
