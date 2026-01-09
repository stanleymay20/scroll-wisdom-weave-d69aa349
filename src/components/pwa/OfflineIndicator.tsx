import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, AlertCircle } from 'lucide-react';
import { useOfflineIndicator } from '@/hooks/usePWA';

/**
 * CONTRACT 4.3 - Offline State Must Be Honest
 * 
 * PWA must never lie:
 * - If offline: Explicit banner: "Offline — some features unavailable"
 * - If cached: Read-only mode allowed
 * - If action requires network: Block action + explain why
 */
export const OfflineIndicator = forwardRef<HTMLDivElement>(function OfflineIndicator(_, ref) {
  const { showOffline, isOnline } = useOfflineIndicator();

  return (
    <AnimatePresence>
      {showOffline && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-[100]"
        >
          <div 
            className={`py-2.5 px-4 text-center text-sm font-medium shadow-md ${
              isOnline 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4" />
                  <span>Back online — all features available</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4" />
                  <span>You're offline — some features unavailable</span>
                  <span className="text-xs opacity-75 ml-2">(cached content still accessible)</span>
                </>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
