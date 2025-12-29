import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, AlertCircle, BookOpen, Download } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface OfflineGenerationBannerProps {
  /** Show when user attempts generation while offline */
  showGenerationBlocked?: boolean;
  /** Show when AI balance is exhausted */
  showBalanceExhausted?: boolean;
  onDismiss?: () => void;
}

export function OfflineGenerationBanner({ 
  showGenerationBlocked = false,
  showBalanceExhausted = false,
  onDismiss 
}: OfflineGenerationBannerProps) {
  const { isOnline } = usePWA();
  
  // Show offline banner if offline and trying to generate
  const showOfflineBanner = !isOnline && showGenerationBlocked;
  
  // Show balance banner if balance exhausted but still online
  const showBalanceBanner = isOnline && showBalanceExhausted;
  
  if (!showOfflineBanner && !showBalanceBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6"
      >
        {showOfflineBanner && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-full bg-amber-500/20 p-2">
                <WifiOff className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-500">You're Offline</h3>
                <p className="mt-1 text-sm text-amber-200/80">
                  Book generation requires an internet connection. Your previously opened books are still available for offline reading.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
                    <Link to="/library">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Open Library
                    </Link>
                  </Button>
                </div>
              </div>
              {onDismiss && (
                <button 
                  onClick={onDismiss}
                  className="text-amber-500/60 hover:text-amber-500"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}
        
        {showBalanceBanner && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-full bg-primary/20 p-2">
                <AlertCircle className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-primary">Generation Temporarily Unavailable</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your generation credits have been exhausted. Reading, downloads, and all other features continue to work normally.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/pricing">
                      View Plans
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/library">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Continue Reading
                    </Link>
                  </Button>
                </div>
              </div>
              {onDismiss && (
                <button 
                  onClick={onDismiss}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to determine if generation should be blocked
 */
export function useGenerationAvailability() {
  const { isOnline } = usePWA();
  
  return {
    canGenerate: isOnline,
    isOffline: !isOnline,
    reason: !isOnline ? 'offline' : null,
  };
}
