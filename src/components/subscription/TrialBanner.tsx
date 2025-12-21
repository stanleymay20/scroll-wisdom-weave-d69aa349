import { TRIAL_MODE, TRIAL_END_DATE, isTrialActive } from '@/lib/config';
import { Gift, X, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export function TrialBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useLanguage();

  // Only show during active trial mode
  if (!TRIAL_MODE || !isTrialActive() || dismissed) {
    return null;
  }

  // Calculate days remaining
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((TRIAL_END_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="relative overflow-hidden border-b border-primary/20 mt-16 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-emerald-500/10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(var(--primary)/0.15)_0%,_transparent_70%)]" />
      <div className="container mx-auto px-4 py-3 relative">
        <div className="flex items-center justify-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Gift className="h-5 w-5 text-emerald-500 animate-float" />
              <Sparkles className="h-3 w-3 text-primary absolute -top-1 -right-1" />
            </div>
            <span className="text-foreground font-semibold bg-gradient-to-r from-emerald-500 to-primary bg-clip-text text-transparent">
              {t('trial.title')}
            </span>
          </div>
          <span className="text-muted-foreground hidden sm:inline">
            {t('trial.description').replace('{days}', String(daysRemaining))}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
            {t('trial.allFeatures')}
          </span>
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
