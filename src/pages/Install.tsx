import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, Monitor, Check, ArrowRight, Wifi, WifiOff, BookOpen, Headphones, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    // Check platform
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setIsIOS(true);
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    }

    // Check if installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    }
  };

  const features = [
    {
      icon: WifiOff,
      title: 'Offline Reading',
      description: 'Read your books anywhere, even without internet'
    },
    {
      icon: Headphones,
      title: 'Offline Audio',
      description: 'Listen to text-to-speech narration offline'
    },
    {
      icon: FileText,
      title: 'Cached Exports',
      description: 'Access downloaded PDFs and EPUBs anytime'
    },
    {
      icon: BookOpen,
      title: 'Your Library',
      description: 'Full access to your book library offline'
    }
  ];

  const iosSteps = [
    'Tap the Share button at the bottom of Safari',
    'Scroll down and tap "Add to Home Screen"',
    'Tap "Add" in the top right corner',
    'Find ScrollLibrary on your home screen!'
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
              {platform === 'ios' ? (
                <Smartphone className="w-10 h-10 text-primary" />
              ) : platform === 'android' ? (
                <Smartphone className="w-10 h-10 text-primary" />
              ) : (
                <Monitor className="w-10 h-10 text-primary" />
              )}
            </div>
            
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Install ScrollLibrary
            </h1>
            <p className="text-xl text-muted-foreground">
              Get the full app experience with offline support
            </p>
          </motion.div>

          {/* Already Installed */}
          {isInstalled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center mb-12"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Already Installed!
              </h2>
              <p className="text-muted-foreground">
                ScrollLibrary is installed on your device. Enjoy offline reading!
              </p>
            </motion.div>
          )}

          {/* Install Button or iOS Instructions */}
          {!isInstalled && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-border bg-card p-8 mb-12"
            >
              {isIOS ? (
                <div>
                  <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
                    How to Install on iOS
                  </h2>
                  <ol className="space-y-4">
                    {iosSteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-4">
                        <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                          {index + 1}
                        </span>
                        <span className="text-foreground pt-1">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-6 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <strong>Note:</strong> Make sure you're using Safari. Other browsers on iOS don't support installing web apps.
                  </div>
                </div>
              ) : deferredPrompt ? (
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Ready to Install
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Click the button below to add ScrollLibrary to your {platform === 'android' ? 'home screen' : 'applications'}
                  </p>
                  <Button onClick={handleInstall} size="lg" className="gap-2">
                    <Download className="w-5 h-5" />
                    Install ScrollLibrary
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Installation Available
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    {platform === 'desktop' 
                      ? 'Look for the install icon in your browser\'s address bar'
                      : 'Use your browser menu to add this app to your home screen'
                    }
                  </p>
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Wifi className="w-4 h-4" />
                    <span>Browsing in {platform} mode</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
              What You Get
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <feature.icon className="w-8 h-8 text-primary mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          {!isInstalled && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 text-center"
            >
              <a 
                href="/" 
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                Continue to ScrollLibrary
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
