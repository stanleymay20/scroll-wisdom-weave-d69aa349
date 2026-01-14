import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useOfflineIndicator } from '@/hooks/usePWA';
import { useConnectionState } from '@/hooks/useContract5';
import { Button } from '@/components/ui/button';

/**
 * CONTRACT 5 - Rule 5.3: Honest Offline Detection
 * 
 * App may NEVER:
 * - Say "Offline" while backend works
 * - Say "Online" while requests fail
 * 
 * States:
 * - Online: Green, no banner
 * - Offline: Red banner with clear messaging
 * - Unstable: Amber banner with "Connection unstable" message
 */
export const OfflineIndicator = forwardRef<HTMLDivElement>(function OfflineIndicator(_, ref) {
  const { showOffline, isOnline } = useOfflineIndicator();
  const { state: connectionState, checkConnection } = useConnectionState();
  const [isChecking, setIsChecking] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleRetry = async () => {
    setIsChecking(true);
    await checkConnection();
    setIsChecking(false);
  };

  // Determine what to show based on combined state
  const isUnstable = connectionState === 'unstable';
  const isDefinitelyOffline = showOffline && !isOnline && connectionState === 'offline';
  
  const shouldShow = isDefinitelyOffline || isUnstable;

  if (!shouldShow) return null;

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
        <div className={`py-2.5 px-4 text-center text-sm font-medium shadow-md border-b ${
          isDefinitelyOffline 
            ? 'bg-destructive/10 text-destructive border-destructive/20' 
            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
        }`}>
          <div className="flex items-center justify-center gap-2">
            {isDefinitelyOffline ? (
              <WifiOff className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span>
              {isDefinitelyOffline 
                ? "You're offline — some features unavailable"
                : "Connection unstable — some requests may fail"
              }
            </span>
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
          
          {/* Diagnostics Panel */}
          <AnimatePresence>
            {showDiagnostics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 text-xs text-left max-w-md mx-auto"
              >
                <div className="bg-background/50 rounded p-2 space-y-1">
                  <p><strong>Status:</strong> {connectionState}</p>
                  <p><strong>Navigator.onLine:</strong> {navigator.onLine ? 'true' : 'false'}</p>
                  <p className="opacity-75">
                    {isDefinitelyOffline 
                      ? 'Cached content is still accessible. Generating, exporting, and syncing are disabled.'
                      : 'Some requests may fail. The app will retry automatically.'
                    }
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
