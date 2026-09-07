import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from './useAdmin';
import { isTrialActive } from '@/lib/config';
import { resolveEntitlements, type Entitlements } from '@/lib/entitlementAccess';

export type { Entitlements } from '@/lib/entitlementAccess';
export { hasFeatureAccess, hasPlanAccess } from '@/lib/entitlementAccess';

/**
 * React adapter for the pure entitlement policy in lib/entitlementAccess.
 *
 * There are intentionally no hard-coded account/email overrides here. Review
 * accounts must be provisioned through the same server-side subscription and
 * authorization paths as any other account.
 */
export function useEntitlements(): Entitlements {
  const { tier, isLoading: subLoading } = useSubscription();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  return resolveEntitlements({
    tier,
    isAdmin,
    trialActive: isTrialActive(),
    stillLoading: subLoading || adminLoading,
  });
}
