import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
import { isTrialActive } from '@/lib/config';
import { resolveEntitlements, type Entitlements } from '@/lib/entitlementAccess';

export type { Entitlements } from '@/lib/entitlementAccess';
export { hasFeatureAccess, hasPlanAccess } from '@/lib/entitlementAccess';

// Dedicated app-store review account. This grants client feature preview only;
// server-authoritative actions must still authenticate and authorize requests.
const REVIEWER_EMAILS = ['reviewer@scrolllibrary.org'];

/**
 * React adapter for the pure entitlement policy in lib/entitlementAccess.
 */
export function useEntitlements(): Entitlements {
  const { tier, user, isLoading: subLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const isReviewer = user?.email ? REVIEWER_EMAILS.includes(user.email.toLowerCase()) : false;

  return resolveEntitlements({
    tier,
    isAdmin,
    isReviewer,
    trialActive: isTrialActive(),
    stillLoading: subLoading || adminLoading,
  });
}
