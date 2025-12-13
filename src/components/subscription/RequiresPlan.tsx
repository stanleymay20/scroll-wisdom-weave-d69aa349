import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useIsAdmin } from '@/hooks/useAdmin';
import { SubscriptionTier, SUBSCRIPTION_TIERS } from '@/lib/subscription';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles, GraduationCap, Lock } from 'lucide-react';
import { useState } from 'react';

interface RequiresPlanProps {
  tier: SubscriptionTier;
  children: ReactNode;
  fallback?: ReactNode;
  showUpgradeModal?: boolean;
}

const tierIcons: Record<SubscriptionTier, ReactNode> = {
  free: null,
  student: <GraduationCap className="h-6 w-6" />,
  premium: <Sparkles className="h-6 w-6" />,
  prophet_tier: <Crown className="h-6 w-6" />,
};

const tierPriority: Record<SubscriptionTier, number> = {
  free: 0,
  student: 1,
  premium: 2,
  prophet_tier: 3,
};

export function RequiresPlan({ 
  tier: requiredTier, 
  children, 
  fallback,
  showUpgradeModal = true 
}: RequiresPlanProps) {
  const { tier: currentTier } = useSubscription();
  const { isAdmin } = useIsAdmin();
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  // Admins bypass all tier checks
  if (isAdmin) {
    return <>{children}</>;
  }

  const hasAccess = tierPriority[currentTier] >= tierPriority[requiredTier];

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradeModal) {
    return null;
  }

  return (
    <>
      <div 
        className="relative cursor-pointer group"
        onClick={() => setShowModal(true)}
      >
        <div className="opacity-50 pointer-events-none transition-opacity group-hover:opacity-60">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
          <div className="flex items-center gap-2 text-primary font-medium px-4 py-2 bg-muted/80 rounded-full border border-primary/30">
            <Lock className="h-4 w-4" />
            <span className="text-sm">
              Upgrade to unlock
            </span>
          </div>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md bg-gradient-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-primary/20 rounded-full text-primary">
                {tierIcons[requiredTier]}
              </div>
              Upgrade to {SUBSCRIPTION_TIERS[requiredTier].name}
            </DialogTitle>
            <DialogDescription className="pt-2">
              This feature requires the {SUBSCRIPTION_TIERS[requiredTier].name} plan 
              (${SUBSCRIPTION_TIERS[requiredTier].monthlyPrice}/month).
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Maybe Later
            </Button>
            <Button variant="gold" onClick={() => navigate('/pricing')}>
              View Plans
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RequiresAdmin({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return null;
  }

  if (!isAdmin) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

export function RequiresStudent({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RequiresPlan tier="student" fallback={fallback}>{children}</RequiresPlan>;
}

export function RequiresPremium({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RequiresPlan tier="premium" fallback={fallback}>{children}</RequiresPlan>;
}

export function RequiresProphet({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return <RequiresPlan tier="prophet_tier" fallback={fallback}>{children}</RequiresPlan>;
}
