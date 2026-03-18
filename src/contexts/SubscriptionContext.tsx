import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier, getTierFromProductId, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import { LAUNCH_MODE_CONFIG, isLaunchModeActive } from '@/lib/config';
import { getErrorMessageText, isTransientAuthError } from '@/lib/authResilience';
import { User } from '@supabase/supabase-js';
...
  const resetAnonymousState = useCallback(() => {
    setUser(null);
    setTier('free');
    setSubscriptionEnd(null);
    setIsLoading(false);
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
        resetAnonymousState();
        return;
      }

      if (!session?.user) {
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
...
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
        setTier(profileData?.plan as SubscriptionTier || 'free');
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
...
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

          if (mounted) {
            resetAnonymousState();
          }
          return;
        }

        if (!session?.user) {
          if (mounted) {
            resetAnonymousState();
          }
          return;
        }

        const { error: userError } = await supabase.auth.getUser();
        if (userError) {
          const msg = userError.message?.toLowerCase() || '';
          const isAuthRejection = msg.includes('invalid') || msg.includes('expired') || msg.includes('not authorized');
          if (isAuthRejection) {
            console.warn('JWT rejected by server, clearing session:', userError.message);
            await supabase.auth.signOut({ scope: 'local' });
            if (mounted) {
              resetAnonymousState();
            }
            return;
          }

          console.warn('getUser() transient error, keeping session:', userError.message);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
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
              setUser(prev => (prev?.id === data.session?.user?.id ? prev : data.session.user));
              setTimeout(() => checkSubscription(true), 0);
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

        setUser(prev => (prev?.id === session.user.id ? prev : session.user));
        setTimeout(() => checkSubscription(true), 0);
      }
    );

    const interval = setInterval(() => checkSubscription(false), 300000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [checkSubscription, resetAnonymousState]);

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
