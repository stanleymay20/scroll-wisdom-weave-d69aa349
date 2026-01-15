/**
 * CONTRACT 5 - Rule 5.5: Honest Offline & Degraded Mode UX
 * 
 * Gentle banners instead of alerts. Users always know what works and what doesn't.
 */

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, CloudOff, RefreshCw } from 'lucide-react';
import { useConnectionState } from '@/hooks/useContract5';
import { OFFLINE_MESSAGES } from '@/lib/contract5';
import { cn } from '@/lib/utils';

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
    const { state, checkConnection } = useConnectionState();
    
    const isOffline = state === 'offline';
    const isUnstable = state === 'unstable';
    
    if (state === 'online' && !showingCached) return null;

    const message = isOffline 
      ? OFFLINE_MESSAGES.offline
      : isUnstable
        ? OFFLINE_MESSAGES.unstable
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
            isOffline 
              ? 'bg-muted/50 text-muted-foreground border-border/50' 
              : 'bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30',
            className
          )}
        >
          <div className={cn(
            'flex items-center justify-center gap-2',
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          )}>
            {isOffline ? (
              <WifiOff className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            ) : (
              <CloudOff className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
            )}
            <span>{message}</span>
            {!compact && (
              <button
                onClick={checkConnection}
                className="ml-2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Check connection"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }
);

/**
 * Inline badge version for use in headers/toolbars
 */
export function OfflineStatusBadge({ className }: { className?: string }) {
  const { state } = useConnectionState();
  
  if (state === 'online') return null;
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      state === 'offline' 
        ? 'bg-muted text-muted-foreground' 
        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      className
    )}>
      <WifiOff className="h-3 w-3" />
      {state === 'offline' ? 'Offline' : 'Unstable'}
    </span>
  );
}
