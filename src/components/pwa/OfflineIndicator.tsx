import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useOfflineIndicator } from '@/hooks/usePWA';
import { Button } from '@/components/ui/button';

/**
 * CONTRACT 5 - Rule 5.3: Honest Offline Detection
 * 
 * CRITICAL: Only show offline banner when CONFIRMED offline
 * - Trust navigator.onLine
 * - Require 5s delay before showing
 * - Hide immediately when back online
 */
export const OfflineIndicator = forwardRef<HTMLDivElement>(function OfflineIndicator(_, ref) {
  const { showOffline, isOnline } = useOfflineIndicator();
  const [isChecking, setIsChecking] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleRetry = async () => {
    setIsChecking(true);
    // Just check navigator.onLine after a brief wait
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsChecking(false);
    // Component will auto-update via hook
  };

  // Only show when confirmed offline
  if (!showOffline || isOnline) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 left-0 right-0 z-[100]"
      >
        <div className="py-2.5 px-4 text-center text-sm font-medium shadow-md border-b bg-destructive/10 text-destructive border-destructive/20">
          <div className="flex items-center justify-center gap-2">
            <WifiOff className="h-4 w-4" />
            <span>You're offline — some features unavailable</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleRetry}
              disabled={isChecking}
            >
              {isChecking ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
            >
              {showDiagnostics ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>
          
          <AnimatePresence>
            {showDiagnostics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 text-xs text-left max-w-md mx-auto"
              >
                <div className="bg-background/50 rounded p-2 space-y-1">
                  <p><strong>Navigator.onLine:</strong> {navigator.onLine ? 'true' : 'false'}</p>
                  <p className="opacity-75">
                    Cached content is still accessible. Generating, exporting, and syncing are disabled.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
