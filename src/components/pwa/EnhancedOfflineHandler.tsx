/**
 * Enhanced PWA Offline Handler
 * 
 * Provides robust error handling and retry logic for PWA offline scenarios
 * with better user feedback and automatic recovery.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  WifiOff, 
  RefreshCw, 
  CheckCircle2,
  Loader2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useOfflineIndicator } from '@/hooks/usePWA';

interface RetryState {
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  nextRetryIn: number;
}

interface EnhancedOfflineHandlerProps {
  onRetry?: () => Promise<void>;
  onDismiss?: () => void;
  errorMessage?: string;
  className?: string;
}

export function EnhancedOfflineHandler({
  onRetry,
  onDismiss,
  errorMessage = 'Connection lost',
  className,
}: EnhancedOfflineHandlerProps) {
  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    retryCount: 0,
    maxRetries: 5,
    lastError: null,
    nextRetryIn: 0,
  });
  const { showOffline, isOnline } = useOfflineIndicator();
  const [showDetails, setShowDetails] = useState(false);

  // Auto-retry when connection restored
  useEffect(() => {
    if (isOnline && onRetry) {
      handleRetry();
    }
  }, [isOnline]);

  // Countdown timer for next retry
  useEffect(() => {
    if (retryState.nextRetryIn <= 0) return;

    const timer = setInterval(() => {
      setRetryState(prev => ({
        ...prev,
        nextRetryIn: Math.max(0, prev.nextRetryIn - 1),
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [retryState.nextRetryIn]);

  // Auto-retry with exponential backoff
  useEffect(() => {
    if (retryState.nextRetryIn === 0 && retryState.retryCount > 0 && retryState.retryCount < retryState.maxRetries) {
      handleRetry();
    }
  }, [retryState.nextRetryIn]);

  const handleRetry = useCallback(async () => {
    if (retryState.isRetrying || !onRetry) return;

    setRetryState(prev => ({ ...prev, isRetrying: true, lastError: null }));

    try {
      await onRetry();
      // Success - reset state
      setRetryState({
        isRetrying: false,
        retryCount: 0,
        maxRetries: 5,
        lastError: null,
        nextRetryIn: 0,
      });
      onDismiss?.();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Retry failed';
      const newCount = retryState.retryCount + 1;
      
      // Exponential backoff: 2, 4, 8, 16, 32 seconds
      const backoffSeconds = Math.min(Math.pow(2, newCount), 32);
      
      setRetryState(prev => ({
        ...prev,
        isRetrying: false,
        retryCount: newCount,
        lastError: errorMsg,
        nextRetryIn: newCount < prev.maxRetries ? backoffSeconds : 0,
      }));
    }
  }, [onRetry, onDismiss, retryState.isRetrying, retryState.retryCount]);

  const canAutoRetry = retryState.retryCount < retryState.maxRetries;
  const progress = (retryState.retryCount / retryState.maxRetries) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50',
        'bg-background border rounded-xl shadow-xl overflow-hidden',
        className
      )}
    >
      {/* Status Bar */}
      <div className={cn(
        'px-4 py-3 flex items-center gap-3',
        isOnline ? 'bg-emerald-500/10' : 'bg-destructive/10'
      )}>
        {retryState.isRetrying ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : isOnline ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <WifiOff className="h-5 w-5 text-destructive" />
        )}
        
        <div className="flex-1">
          <p className="font-medium text-sm">
            {retryState.isRetrying 
              ? 'Reconnecting...' 
              : isOnline 
                ? 'Connection restored' 
                : errorMessage}
          </p>
          {retryState.lastError && !retryState.isRetrying && (
            <p className="text-xs text-muted-foreground">{retryState.lastError}</p>
          )}
        </div>

        {onDismiss && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Retry Progress */}
      {showOffline && canAutoRetry && (
        <div className="px-4 py-2 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Retry attempt {retryState.retryCount}/{retryState.maxRetries}</span>
            {retryState.nextRetryIn > 0 && (
              <span>Next retry in {retryState.nextRetryIn}s</span>
            )}
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t bg-muted/30 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          disabled={retryState.isRetrying}
          className="gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', retryState.isRetrying && 'animate-spin')} />
          {retryState.isRetrying ? 'Retrying...' : 'Retry Now'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Details'}
        </Button>

        {!canAutoRetry && (
          <span className="text-xs text-muted-foreground ml-auto">
            Auto-retry exhausted
          </span>
        )}
      </div>

      {/* Diagnostic Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-t bg-muted/10 text-xs space-y-1">
              <p><strong>Online Status:</strong> {navigator.onLine ? 'Connected' : 'Disconnected'}</p>
              <p><strong>Retry Count:</strong> {retryState.retryCount}</p>
              <p><strong>Connection Type:</strong> {(navigator as any).connection?.effectiveType || 'Unknown'}</p>
              {retryState.lastError && (
                <p className="text-destructive"><strong>Last Error:</strong> {retryState.lastError}</p>
              )}
              <p className="pt-2 text-muted-foreground">
                Cached content remains accessible. Generation, export, and sync features require connection.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Hook to wrap async operations with offline-aware retry logic
 */
export function useOfflineRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; onSuccess?: (data: T) => void } = {}
) {
  const { maxRetries = 3, onSuccess } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHandler, setShowHandler] = useState(false);

  const execute = useCallback(async () => {
    if (!navigator.onLine) {
      setError('You are offline');
      setShowHandler(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await operation();
      onSuccess?.(result);
      setShowHandler(false);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed';
      setError(message);
      setShowHandler(true);
    } finally {
      setIsLoading(false);
    }
  }, [operation, onSuccess]);

  const retry = useCallback(async () => {
    return execute();
  }, [execute]);

  const dismiss = useCallback(() => {
    setShowHandler(false);
    setError(null);
  }, []);

  return {
    execute,
    retry,
    dismiss,
    isLoading,
    error,
    showHandler,
  };
}

export default EnhancedOfflineHandler;
