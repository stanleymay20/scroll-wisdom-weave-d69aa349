import { LAUNCH_MODE, LAUNCH_MODE_CONFIG } from '@/lib/config';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Rocket, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { tier } = useSubscription();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Only show for free tier users during launch mode
  if (!LAUNCH_MODE || !LAUNCH_MODE_CONFIG.showBanner || tier !== 'free' || dismissed) {
    return null;
  }

  return (
    <div className="relative overflow-hidden border-b border-primary/20 mt-16">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--primary)/0.1)_0%,_transparent_70%)]" />
      <div className="container mx-auto px-4 py-3 relative">
        <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary animate-float" />
            <span className="text-foreground font-medium">
              {t('launch.promo')}
            </span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">
            {t('launch.limit')
              .replace('{limit}', String(LAUNCH_MODE_CONFIG.freeBookLimit))
              .replace('{words}', LAUNCH_MODE_CONFIG.freeMaxWordCount.toLocaleString())}
          </span>
          <Button 
            size="sm" 
            variant="gold" 
            className="h-7 text-xs"
            onClick={() => navigate('/pricing')}
          >
            {t('launch.upgrade')}
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
