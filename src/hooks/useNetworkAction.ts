import { useCallback } from 'react';
import { usePWA } from './usePWA';
import { useToast } from './use-toast';

/**
 * CONTRACT 4.3 - Network-Aware Actions
 * 
 * Hook that wraps async actions and blocks them when offline,
 * providing clear user feedback instead of silent failures.
 */
export function useNetworkAction() {
  const { isOnline } = usePWA();
  const { toast } = useToast();

  /**
   * Execute an action only if online, with graceful degradation
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

      if (!isOnline && !allowOffline) {
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
            title: 'Connection lost',
            description: 'Please check your internet connection and try again.',
            variant: 'destructive',
          });
          return null;
        }
        throw error;
      }
    },
    [isOnline, toast]
  );

  /**
   * Check if an action can proceed
   */
  const canProceed = useCallback(
    (actionName?: string): boolean => {
      if (!isOnline) {
        toast({
          title: `${actionName || 'Action'} unavailable offline`,
          description: 'This feature requires an internet connection.',
          variant: 'default',
        });
        return false;
      }
      return true;
    },
    [isOnline, toast]
  );

  return {
    isOnline,
    executeIfOnline,
    canProceed,
  };
}

/**
 * CONTRACT 4.5 - Graceful Degradation Helper
 * 
 * Wraps a component action with offline-awareness
 */
export function useGracefulDegradation() {
  const { isOnline } = usePWA();

  return {
    isOnline,
    // Feature availability based on online status
    canGenerate: isOnline,
    canExport: isOnline,
    canSync: isOnline,
    canSearch: true, // Can search cached content
    canRead: true, // Can read cached content
    canBrowse: true, // Can browse cached library
  };
}
