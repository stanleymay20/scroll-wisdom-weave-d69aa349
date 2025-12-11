import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SubscriptionTier, getTierFromProductId, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import { User } from '@supabase/supabase-js';

interface SubscriptionContextType {
  user: User | null;
  tier: SubscriptionTier;
  isSubscribed: boolean;
  subscriptionEnd: string | null;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  canGenerateBooks: boolean;
  maxWordCount: number;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setUser(null);
        setTier('free');
        setSubscriptionEnd(null);
        return;
      }

      setUser(session.user);

      // Check subscription status via edge function
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('Error checking subscription:', error);
        // Fall back to profile plan
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', session.user.id)
          .maybeSingle();
        
        if (profile?.plan) {
          setTier(profile.plan as SubscriptionTier);
        }
        return;
      }

      if (data?.subscribed && data?.product_id) {
        const detectedTier = getTierFromProductId(data.product_id);
        setTier(detectedTier);
        setSubscriptionEnd(data.subscription_end);
        
        // Update profile plan
        await supabase
          .from('profiles')
          .update({ plan: detectedTier })
          .eq('id', session.user.id);
      } else {
        setTier('free');
        setSubscriptionEnd(null);
      }
    } catch (error) {
      console.error('Subscription check error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => checkSubscription(), 0);
        } else {
          setTier('free');
          setSubscriptionEnd(null);
          setIsLoading(false);
        }
      }
    );

    // Initial check
    checkSubscription();

    // Periodic check every minute
    const interval = setInterval(checkSubscription, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [checkSubscription]);

  const isSubscribed = tier !== 'free';
  const canGenerateBooks = SUBSCRIPTION_TIERS[tier].features.canGenerateBooks;
  const maxWordCount = SUBSCRIPTION_TIERS[tier].features.maxWordCount;

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
