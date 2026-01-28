/**
 * CONTRACT 5 - Rule 5.5: Honest Offline & Degraded Mode UX
 * 
 * Gentle banners instead of alerts. Users always know what works and what doesn't.
 * FIXED: Uses robust connectivity verification from usePWA hook
 */

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { OFFLINE_MESSAGES } from '@/lib/contract5';
import { cn } from '@/lib/utils';
import { useOfflineIndicator } from '@/hooks/usePWA';

interface GentleOfflineBannerProps {
  /** Show "showing cached data" message */
  showingCached?: boolean;
  /** Custom class name */
  className?: string;
  /** Compact mode for inline use */
  compact?: boolean;
}

export const GentleOfflineBanner = forwardRef<HTMLDivElement, GentleOfflineBannerProps>(
  function GentleOfflineBanner({ showingCached, className, compact }, ref) {
    // Use robust offline indicator from PWA hook (requires 2 consecutive failures + 3s delay)
    const { showOffline } = useOfflineIndicator();
    
    // Only show when truly offline (verified) or explicitly showing cached data
    if (!showOffline && !showingCached) return null;

    const message = showOffline 
      ? OFFLINE_MESSAGES.offline
      : showingCached
        ? OFFLINE_MESSAGES.showingCached
        : null;

    if (!message) return null;

    return (
      <AnimatePresence>
        <motion.div
          ref={ref}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={cn(
            'overflow-hidden',
            compact ? 'rounded-lg' : 'border-b',
            'bg-muted/50 text-muted-foreground border-border/50',
            className
          )}
        >
          <div className={cn(
            'flex items-center justify-center gap-2',
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          )}>
            <WifiOff className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            <span>{message}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }
);

/**
 * Inline badge version for use in headers/toolbars
 * Only shows when actually offline (uses robust PWA verification)
 */
export function OfflineStatusBadge({ className }: { className?: string }) {
  const { showOffline } = useOfflineIndicator();
  
  if (!showOffline) return null;
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      'bg-muted text-muted-foreground',
      className
    )}>
      <WifiOff className="h-3 w-3" />
      Offline
    </span>
  );
}
