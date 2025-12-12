import { LAUNCH_MODE, LAUNCH_MODE_CONFIG } from '@/lib/config';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Rocket, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { tier } = useSubscription();
  const navigate = useNavigate();

  // Only show for free tier users during launch mode
  if (!LAUNCH_MODE || !LAUNCH_MODE_CONFIG.showBanner || tier !== 'free' || dismissed) {
    return null;
  }

  return (
    <div className="relative bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 border-b border-primary/30">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-3 text-sm">
          <Rocket className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-foreground font-medium">
            🚀 Launch Promo: Free book generation is temporarily available!
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            ({LAUNCH_MODE_CONFIG.freeBookLimit} book/day, max {LAUNCH_MODE_CONFIG.freeMaxWordCount.toLocaleString()} words/chapter)
          </span>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs"
            onClick={() => navigate('/pricing')}
          >
            Upgrade for More
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
