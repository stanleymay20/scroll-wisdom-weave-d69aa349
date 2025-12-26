import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';
import { useOfflineIndicator } from '@/hooks/usePWA';

export function OfflineIndicator() {
  const { showOffline, isOnline } = useOfflineIndicator();

  return (
    <AnimatePresence>
      {showOffline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          <div 
            className={`py-2 px-4 text-center text-sm font-medium ${
              isOnline 
                ? 'bg-primary/10 text-primary' 
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4" />
                  Back online
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4" />
                  You're offline — cached content available
                </>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
