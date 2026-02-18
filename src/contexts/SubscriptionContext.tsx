import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier, getTierFromProductId, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import { LAUNCH_MODE_CONFIG, isLaunchModeActive } from '@/lib/config';
import { User } from '@supabase/supabase-js';

interface DailyLimitInfo {
  dailyBookCount: number;
  lastBookDate: string | null;
  canGenerateToday: boolean; // kept for API compat — now means "can generate this month"
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

  // Track last fetch time to prevent redundant calls
  const lastFetchRef = useRef<number>(0);
  const FETCH_COOLDOWN = 30000; // 30 seconds between fetches

  const checkDailyLimits = useCallback(async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('daily_book_count, last_book_date')
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

      if (profile) {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const lastDate = profile.last_book_date;
        const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
        
        // Reset count if it's a new month
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
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      
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
    // Prevent redundant fetches within cooldown period
    const now = Date.now();
    if (!force && now - lastFetchRef.current < FETCH_COOLDOWN) {
      return;
    }
    lastFetchRef.current = now;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setUser(null);
        setTier('free');
        setSubscriptionEnd(null);
        setIsLoading(false);
        return;
      }

      setUser(session.user);
      
      // Batch all profile data in a single query for efficiency
      const [profileResult, subResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('daily_book_count, last_book_date, plan')
          .or(`user_id.eq.${session.user.id},id.eq.${session.user.id}`)
          .maybeSingle(),
        supabase.functions.invoke('check-subscription'),
      ]);

      // Process profile data (monthly limits + plan)
      if (profileResult.data) {
        const profile = profileResult.data;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastDate = profile.last_book_date;
        const lastMonth = lastDate ? lastDate.slice(0, 7) : null;
        const count = lastMonth === currentMonth ? (profile.daily_book_count || 0) : 0;

        setDailyLimitInfo({
          dailyBookCount: count,
          lastBookDate: lastDate,
          canGenerateToday: count < LAUNCH_MODE_CONFIG.freeBookLimit,
        });
      }

      // Check TTS usage separately (less critical)
      checkTTSUsage(session.user.id);

      const { data: subData, error: subError } = subResult;
      const profileData = profileResult.data;

      if (subError) {
        console.error('Error checking subscription:', subError);
        if (profileData?.plan) {
          setTier(profileData.plan as SubscriptionTier);
        }
        setIsLoading(false);
        return;
      }

      // Prefer Stripe tier when available, otherwise fall back to profile plan
      if (subData?.subscribed && subData?.product_id) {
        const detectedTier = getTierFromProductId(subData.product_id);
        setTier(detectedTier);
        setSubscriptionEnd(subData.subscription_end);

        // Update profile plan to keep things consistent (fire and forget)
        // Ensure tier is valid for database enum
        const validPlans: SubscriptionTier[] = ['free', 'premium', 'prophet_tier', 'student'];
        const planToSave = validPlans.includes(detectedTier) ? detectedTier : 'premium';

        supabase
          .from('profiles')
          .update({ plan: planToSave as 'free' | 'premium' | 'prophet_tier' | 'student' })
          .or(`user_id.eq.${session.user.id},id.eq.${session.user.id}`)
          .then(() => {});
      } else {
        // Stripe says no active subscription — trust Stripe as source of truth
        // The check-subscription function also syncs this to the profile
        setTier('free');
        setSubscriptionEnd(null);
      }
    } catch (error) {
      console.error('Subscription check error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [checkTTSUsage]);

  const incrementDailyBookCount = useCallback(async () => {
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);
    const lastMonth = dailyLimitInfo.lastBookDate ? dailyLimitInfo.lastBookDate.slice(0, 7) : null;
    const newCount = lastMonth === currentMonth 
      ? dailyLimitInfo.dailyBookCount + 1 
      : 1;

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

    // Upsert TTS usage
    await supabase
      .from('tts_usage')
      .upsert({
        user_id: user.id,
        month: currentMonth,
        minutes_used: newTotal,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,month',
      });

    setTtsMinutesUsed(newTotal);
  }, [user, ttsMinutesUsed]);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only update if user actually changed to prevent cascading re-renders
        setUser(prev => {
          if (prev?.id === session?.user?.id) return prev;
          return session?.user ?? null;
        });
        if (session?.user) {
          // Force check on auth state change (deferred to avoid deadlock)
          setTimeout(() => checkSubscription(true), 0);
        } else {
          setTier('free');
          setSubscriptionEnd(null);
          setIsLoading(false);
        }
      }
    );

    // Initial check deferred — onAuthStateChange above already calls checkSubscription
    // when a session exists, so only schedule a fallback for the no-session case.
    const initialTimer = setTimeout(() => {
      if (!user) checkSubscription(true);
    }, 200);

    // Periodic check every 5 minutes
    const interval = setInterval(() => checkSubscription(false), 300000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      clearTimeout(initialTimer);
    };
  }, [checkSubscription]);

  const isSubscribed = tier !== 'free';
  
  // Can generate books logic - considers launch mode (disabled during trial)
  const canGenerateBooks = (() => {
    if (SUBSCRIPTION_TIERS[tier].features.canGenerateBooks) {
      return true;
    }
    // In launch mode (not trial), free tier can generate with daily limit
    if (isLaunchModeActive() && tier === 'free' && dailyLimitInfo.canGenerateToday) {
      return true;
    }
    return false;
  })();

  // Max word count - respects launch mode limits (disabled during trial)
  const maxWordCount = (() => {
    if (isLaunchModeActive() && tier === 'free') {
      return LAUNCH_MODE_CONFIG.freeMaxWordCount;
    }
    return SUBSCRIPTION_TIERS[tier].features.maxWordCount;
  })();

  return (
    <SubscriptionContext.Provider value={{
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
    }}>
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
