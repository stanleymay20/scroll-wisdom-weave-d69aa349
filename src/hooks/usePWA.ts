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
  // IMPORTANT: navigator.onLine is unreliable (especially iOS/PWA).
  // We ALWAYS attempt an actual fetch before declaring offline.

  // Try multiple same-origin endpoints with fast timeouts.
  // Using GET (not HEAD) improves compatibility with some SW/proxies/CDNs.
  const endpoints = [
    { url: '/manifest.webmanifest', timeout: 2500 },
    { url: '/favicon.png', timeout: 2500 },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout);

      const response = await fetch(endpoint.url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 304) {
        return true;
      }
    } catch {
      // Continue to next endpoint
    }
  }

  // Final fallback: external reachability check.
  // no-cors returns an opaque response on success; it only throws on network failure.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    await fetch('https://www.gstatic.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
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
  const isOnlineRef = useRef<boolean>(true);

  // Debounced connectivity verification with optimistic default
  const checkConnectivity = useCallback(async (immediate = false) => {
    const now = Date.now();
    // Throttle: don't check more than once per 3 seconds unless immediate
    if (!immediate && now - lastVerifyRef.current < 3000) return;
    lastVerifyRef.current = now;

    // Optimistic: assume online while we verify in the background.
    setIsOnline(true);

    const actuallyOnline = await verifyConnectivity();
    setIsOnline(actuallyOnline);
  }, []);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

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

    // Initial state: optimistic, then verify quickly.
    // This prevents iOS/PWA false negatives from navigator.onLine.
    setIsOnline(true);

    // Verify shortly after mount (gives the app time to paint first)
    const initialVerifyTimer = setTimeout(() => {
      checkConnectivity(true);
    }, 800);

    // Periodic verification every 60 seconds - only when we're showing offline.
    verifyIntervalRef.current = setInterval(() => {
      if (!document.hidden && !isOnlineRef.current) {
        checkConnectivity(true);
      }
    }, 60000);

    // Verify on visibility change (tab becomes active) - only if we think we're offline
    const handleVisibilityChange = () => {
      if (!document.hidden && !isOnlineRef.current) {
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending timers
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isOnline) {
      // VERY long delay (3s) to prevent flickering on transient network issues
      // Only show offline banner if we've been offline for 3 full seconds
      timerRef.current = setTimeout(() => {
        setShowOffline(true);
      }, 3000);
    } else {
      // Immediately hide offline banner when online
      setShowOffline(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOnline]);

  return { showOffline, isOnline };
}
