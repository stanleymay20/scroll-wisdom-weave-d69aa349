import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check if iOS
    const ios = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIOS(ios);

    // Check if already dismissed
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    const lastDismissed = dismissed ? parseInt(dismissed) : 0;
    const daysSinceDismissed = (Date.now() - lastDismissed) / (1000 * 60 * 60 * 24);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Only show after user engagement (scroll or click)
      if (daysSinceDismissed > 7) {
        setTimeout(() => {
          setShowPrompt(true);
        }, 5000); // Show after 5 seconds
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show iOS prompt after engagement
    if (ios && !standalone && daysSinceDismissed > 7) {
      setTimeout(() => {
        setShowPrompt(true);
      }, 8000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setShowPrompt(false);
        setDeferredPrompt(null);
      }
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

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
                  ? "Tap Share, then 'Add to Home Screen' for the best experience."
                  : "Install our app for offline reading and faster access."
                }
              </p>
              
              {!isIOS && deferredPrompt && (
                <Button
                  onClick={handleInstall}
                  size="sm"
                  className="mt-3"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Install App
                </Button>
              )}

              {isIOS && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Tap</span>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 7h-2V3H9v4H7l3 4 3-4zm-3 8c-4.41 0-8-3.59-8-8h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.41-3.59 8-8 8z" />
                  </svg>
                  <span>then "Add to Home Screen"</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
