import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAState {
  isInstalled: boolean;
  isInstallable: boolean;
  isIOS: boolean;
  isOnline: boolean;
  platform: 'ios' | 'android' | 'desktop';
  install: () => Promise<boolean>;
}

/**
 * CONTRACT 4.3 - Robust connectivity verification
 * 
 * RULES:
 * - Never report offline if we can actually reach the network
 * - Use multiple verification strategies
 * - Be optimistic but honest
 * - Timeout quickly to avoid blocking UI
 */
async function verifyConnectivity(): Promise<boolean> {
  // Fast path: if navigator says offline, trust it
  if (!navigator.onLine) {
    return false;
  }

  // Try multiple endpoints with fast timeouts
  const endpoints = [
    { url: '/manifest.webmanifest', timeout: 2000 },
    { url: '/favicon.png', timeout: 2000 },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout);
      
      const response = await fetch(endpoint.url, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok || response.status === 304) {
        return true;
      }
    } catch {
      // Continue to next endpoint
    }
  }

  // Final fallback: try external endpoint with no-cors
  // This is aggressive but prevents false offline states
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    
    // no-cors mode: won't throw for network success, only for actual network failure
    await fetch('https://www.gstatic.com/generate_204', {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch {
    // If all attempts fail, we're truly offline
    return false;
  }
}

export function usePWA(): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(true); // Optimistic default
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVerifyRef = useRef<number>(0);

  // Debounced connectivity verification with optimistic default
  const checkConnectivity = useCallback(async (immediate = false) => {
    const now = Date.now();
    // Throttle: don't check more than once per 3 seconds unless immediate
    if (!immediate && now - lastVerifyRef.current < 3000) return;
    lastVerifyRef.current = now;

    // Quick synchronous check first - be optimistic
    if (navigator.onLine) {
      // Set online immediately, then verify in background
      setIsOnline(true);
      
      // Background verification (non-blocking)
      verifyConnectivity().then(actuallyOnline => {
        if (!actuallyOnline) {
          // Only set offline if verification definitively fails
          setIsOnline(false);
        }
      });
    } else {
      // Navigator says offline - verify before committing
      const actuallyOnline = await verifyConnectivity();
      setIsOnline(actuallyOnline);
    }
  }, []);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    }

    // Check if already installed
    const checkInstalled = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches 
        || (window.navigator as any).standalone === true;
      setIsInstalled(standalone);
    };
    checkInstalled();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mediaQuery.addEventListener('change', handleChange);

    // Listen for install prompt
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // Listen for successful install
    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener('appinstalled', handleInstalled);

    // Online/offline status with verification
    const handleOnline = () => {
      // Immediately set online - no verification needed for online event
      // This prevents false offline states
      setIsOnline(true);
      console.log('[PWA] Network: online event received');
    };
    
    const handleOffline = () => {
      // Don't immediately trust offline - verify first
      // This prevents false offline states from transient network blips
      console.log('[PWA] Network: offline event received, verifying...');
      setTimeout(async () => {
        const actuallyOffline = !(await verifyConnectivity());
        if (actuallyOffline) {
          setIsOnline(false);
          console.log('[PWA] Network: confirmed offline');
        } else {
          console.log('[PWA] Network: false alarm, still online');
        }
      }, 500);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial state: trust navigator, verify later
    setIsOnline(navigator.onLine);
    
    // Background verification after 2 seconds (gives app time to load)
    const initialVerifyTimer = setTimeout(() => {
      if (!navigator.onLine) {
        checkConnectivity(true);
      }
    }, 2000);

    // Periodic verification every 60 seconds (less aggressive)
    verifyIntervalRef.current = setInterval(() => {
      if (!document.hidden && !navigator.onLine) {
        // Only verify if navigator thinks we're offline
        checkConnectivity();
      }
    }, 60000);

    // Verify on visibility change (tab becomes active) - only if we think we're offline
    const handleVisibilityChange = () => {
      if (!document.hidden && !isOnline) {
        // Only re-verify when coming back to tab AND we're showing offline
        checkConnectivity(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(initialVerifyTimer);
      if (verifyIntervalRef.current) {
        clearInterval(verifyIntervalRef.current);
      }
    };
  }, [checkConnectivity]);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstalled,
    isInstallable: !!deferredPrompt,
    isIOS: platform === 'ios',
    isOnline,
    platform,
    install
  };
}

// Offline indicator component hook with improved logic
export function useOfflineIndicator() {
  const [showOffline, setShowOffline] = useState(false);
  const { isOnline } = usePWA();
  const wasOfflineRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timers
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isOnline) {
      wasOfflineRef.current = true;
      // Longer delay (1.5s) to prevent flickering on transient network issues
      timerRef.current = setTimeout(() => {
        setShowOffline(true);
      }, 1500);
    } else {
      // Immediately hide offline banner when online
      setShowOffline(false);
      
      // Show "back online" toast only if we were really offline for a while
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        // The OfflineIndicator component can handle showing "back online" message
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOnline]);

  return { showOffline, isOnline };
}
