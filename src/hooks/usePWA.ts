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

// Verify actual connectivity with a lightweight fetch
async function verifyConnectivity(): Promise<boolean> {
  try {
    // Use a tiny HEAD request to verify actual connectivity
    // This catches cases where navigator.onLine lies
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('/manifest.webmanifest', {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    // If navigator says online but fetch fails, check with a fallback
    if (navigator.onLine) {
      try {
        // Try an external endpoint as backup
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return true; // no-cors doesn't throw on success
      } catch {
        return false;
      }
    }
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

  // Debounced connectivity verification
  const checkConnectivity = useCallback(async (immediate = false) => {
    const now = Date.now();
    // Throttle: don't check more than once per 5 seconds unless immediate
    if (!immediate && now - lastVerifyRef.current < 5000) return;
    lastVerifyRef.current = now;

    const online = await verifyConnectivity();
    setIsOnline(online);
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
      // Immediately set optimistic, then verify
      setIsOnline(true);
      checkConnectivity(true);
    };
    
    const handleOffline = () => {
      // Verify before showing offline (navigator can lie)
      checkConnectivity(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial connectivity check (non-blocking)
    setIsOnline(navigator.onLine);
    setTimeout(() => checkConnectivity(true), 1000);

    // Periodic verification every 30 seconds (only when tab is active)
    verifyIntervalRef.current = setInterval(() => {
      if (!document.hidden) {
        checkConnectivity();
      }
    }, 30000);

    // Verify on visibility change (tab becomes active)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
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

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      // Small delay to prevent flickering on quick network blips
      const showTimer = setTimeout(() => {
        if (!navigator.onLine) {
          setShowOffline(true);
        }
      }, 500);
      return () => clearTimeout(showTimer);
    } else {
      // Only show "back online" message if we were actually offline
      if (wasOfflineRef.current) {
        setShowOffline(true);
        const hideTimer = setTimeout(() => {
          setShowOffline(false);
          wasOfflineRef.current = false;
        }, 2000);
        return () => clearTimeout(hideTimer);
      } else {
        setShowOffline(false);
      }
    }
  }, [isOnline]);

  return { showOffline, isOnline };
}
