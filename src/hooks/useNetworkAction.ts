import { useCallback } from 'react';
import { useToast } from './use-toast';

/**
 * CONTRACT 4.3 - Network-Aware Actions
 * 
 * ULTRA-CONSERVATIVE: Only block actions when browser explicitly says offline
 * Never use our own connectivity checks to block - those can have false positives
 */
export function useNetworkAction() {
  const { toast } = useToast();
  // Always trust navigator.onLine - it's the most reliable
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  /**
   * Execute an action - only block if browser explicitly says offline
   */
  const executeIfOnline = useCallback(
    async <T>(
      action: () => Promise<T>,
      options?: {
        offlineMessage?: string;
        actionName?: string;
        allowOffline?: boolean;
      }
    ): Promise<T | null> => {
      const { 
        offlineMessage = 'This action requires an internet connection',
        actionName = 'Action',
        allowOffline = false 
      } = options || {};

      // Only block if browser explicitly reports offline
      if (!navigator.onLine && !allowOffline) {
        toast({
          title: `${actionName} unavailable`,
          description: offlineMessage,
          variant: 'default',
        });
        return null;
      }

      try {
        return await action();
      } catch (error) {
        // Check if error is network-related
        if (error instanceof TypeError && error.message.includes('fetch')) {
          toast({
            title: 'Connection issue',
            description: 'Please check your internet connection and try again.',
            variant: 'destructive',
          });
          return null;
        }
        throw error;
      }
    },
    [toast]
  );

  /**
   * Check if an action can proceed - ultra-permissive
   */
  const canProceed = useCallback(
    (actionName?: string): boolean => {
      // Only block if browser explicitly says offline
      if (!navigator.onLine) {
        toast({
          title: `${actionName || 'Action'} unavailable offline`,
          description: 'This feature requires an internet connection.',
          variant: 'default',
        });
        return false;
      }
      return true;
    },
    [toast]
  );

  return {
    isOnline,
    executeIfOnline,
    canProceed,
  };
}

/**
 * CONTRACT 4.5 - Graceful Degradation Helper
 */
export function useGracefulDegradation() {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return {
    isOnline,
    canGenerate: isOnline,
    canExport: isOnline,
    canSync: isOnline,
    canSearch: true,
    canRead: true,
    canBrowse: true,
  };
}
