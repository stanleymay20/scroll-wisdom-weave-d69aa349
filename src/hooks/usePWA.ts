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
 * CONTRACT 4.3 - Ultra-Conservative Connectivity Verification
 * 
 * CRITICAL RULES:
 * - NEVER declare offline unless absolutely certain
 * - Browser navigator.onLine = true means we're online (trust it)
 * - Only verify when browser explicitly says offline
 * - Avoid false positives at all costs - they hurt UX
 */
async function verifyConnectivity(): Promise<boolean> {
  // RULE 1: If browser says online, trust it immediately
  // This prevents false offline from SW/cache quirks
  if (navigator.onLine) {
    return true;
  }

  // RULE 2: Browser says offline - do ONE quick verification
  // to confirm before showing offline banner
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    // Try our own origin first (most reliable)
    const response = await fetch('/manifest.webmanifest', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok || response.status === 304;
  } catch {
    // Single failure when browser says offline = actually offline
    return false;
  }
}

export function usePWA(): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  // CRITICAL: Always start online - only go offline when CONFIRMED
  const [isOnline, setIsOnline] = useState(true);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOnlineRef = useRef<boolean>(true);

  // Ultra-conservative offline detection
  const checkConnectivity = useCallback(async () => {
    // ALWAYS trust navigator.onLine when it says true
    if (navigator.onLine) {
      setIsOnline(true);
      return;
    }

    // Browser says offline - verify once before believing it
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

    // Online/offline status - trust browser events
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[PWA] Network: online');
    };
    
    const handleOffline = () => {
      // Verify before declaring offline
      console.log('[PWA] Network: offline event, verifying...');
      setTimeout(checkConnectivity, 300);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Always start online - never show false offline on load
    setIsOnline(true);

    // Only verify if browser explicitly says offline
    if (!navigator.onLine) {
      setTimeout(checkConnectivity, 500);
    }

    // Periodic re-check only when showing offline (to auto-recover)
    verifyIntervalRef.current = setInterval(() => {
      if (!document.hidden && !isOnlineRef.current) {
        checkConnectivity();
      }
    }, 30000);

    const handleVisibilityChange = () => {
      // Re-check when tab becomes visible and we're showing offline
      if (!document.hidden && !isOnlineRef.current) {
        checkConnectivity();
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

// Offline indicator - only show when CONFIRMED offline
export function useOfflineIndicator() {
  const [showOffline, setShowOffline] = useState(false);
  const { isOnline } = usePWA();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isOnline && !navigator.onLine) {
      // Only show after 5s of confirmed offline state
      timerRef.current = setTimeout(() => {
        // Double-check before showing
        if (!navigator.onLine) {
          setShowOffline(true);
        }
      }, 5000);
    } else {
      setShowOffline(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOnline]);

  // isOnline should reflect the actual state for button enablement
  return { showOffline, isOnline: isOnline || navigator.onLine };
}
