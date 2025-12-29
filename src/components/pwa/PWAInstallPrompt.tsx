import { useState, useEffect, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { offlineStorage } from '@/lib/offlineStorage';
import { supabase } from '@/integrations/supabase/client';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_COOLDOWN_DAYS = 7;
const MIN_BOOKS_OPENED = 2;
const SHOW_DELAY_MS = 5000;
const IOS_SHOW_DELAY_MS = 8000;

export const PWAInstallPrompt = forwardRef<HTMLDivElement>(function PWAInstallPrompt(_, ref) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasEngaged, setHasEngaged] = useState(false);

  // Check engagement criteria
  const checkEngagement = useCallback(async () => {
    try {
      const booksOpened = await offlineStorage.getBooksOpenedCount();
      if (booksOpened >= MIN_BOOKS_OPENED) {
        setHasEngaged(true);
        return true;
      }
    } catch (e) {
      // Fallback to localStorage
      const booksOpened = parseInt(localStorage.getItem('pwa-books-opened') || '0', 10);
      if (booksOpened >= MIN_BOOKS_OPENED) {
        setHasEngaged(true);
        return true;
      }
    }
    return false;
  }, []);

  // Check if dismissed recently
  const isDismissedRecently = useCallback(() => {
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (!dismissed) return false;
    
    const lastDismissed = parseInt(dismissed, 10);
    const daysSince = (Date.now() - lastDismissed) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_COOLDOWN_DAYS;
  }, []);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIOS(ios);

    // Check login status
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Check engagement
    checkEngagement();

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      subscription.unsubscribe();
    };
  }, [checkEngagement]);

  // Decide when to show prompt
  useEffect(() => {
    if (isStandalone) return; // Already installed
    if (isDismissedRecently()) return; // Recently dismissed
    
    // Show conditions: logged in OR engaged (opened 2+ books)
    const shouldShow = isLoggedIn || hasEngaged;
    
    if (!shouldShow) return;

    // For non-iOS, need beforeinstallprompt event
    if (!isIOS && !deferredPrompt) return;

    // Delay showing to avoid being intrusive
    const delay = isIOS ? IOS_SHOW_DELAY_MS : SHOW_DELAY_MS;
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [isStandalone, isLoggedIn, hasEngaged, isIOS, deferredPrompt, isDismissedRecently]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setShowPrompt(false);
        setDeferredPrompt(null);
        // Track successful install
        try {
          await offlineStorage.trackEngagement('installed', true);
        } catch (e) {
          localStorage.setItem('pwa-installed', 'true');
        }
      }
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  // Don't render if installed or shouldn't show
  if (isStandalone || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96"
      >
        <div className="relative rounded-xl border border-border bg-card p-4 shadow-lg backdrop-blur-sm">
          <button
            onClick={handleDismiss}
            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 pr-6">
              <h3 className="font-semibold text-foreground">
                Install ScrollLibrary
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isIOS 
                  ? "Add to your home screen for offline reading."
                  : "Install for offline reading and faster access."
                }
              </p>
              
              {!isIOS && deferredPrompt && (
                <Button
                  onClick={handleInstall}
                  size="sm"
                  className="mt-3"
                  variant="gold"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Install App
                </Button>
              )}

              {isIOS && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    <Share2 className="h-4 w-4 flex-shrink-0" />
                    <span>Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/**
 * Track book opening for engagement-based install prompt
 * Call this when a user opens a book
 */
export async function trackBookOpened(): Promise<void> {
  try {
    await offlineStorage.incrementBooksOpened();
  } catch (e) {
    // Fallback to localStorage
    const current = parseInt(localStorage.getItem('pwa-books-opened') || '0', 10);
    localStorage.setItem('pwa-books-opened', (current + 1).toString());
  }
}
