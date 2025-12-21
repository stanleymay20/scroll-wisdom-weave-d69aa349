import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie, Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    analytics: false,
    marketing: false,
  });
  const { t } = useLanguage();

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (prefs: CookiePreferences) => {
    localStorage.setItem("cookie-consent", JSON.stringify(prefs));
    localStorage.setItem("cookie-consent-date", new Date().toISOString());
    setShowBanner(false);
    setShowSettings(false);
  };

  const acceptAll = () => {
    saveConsent({ essential: true, analytics: true, marketing: true });
  };

  const acceptEssential = () => {
    saveConsent({ essential: true, analytics: false, marketing: false });
  };

  const savePreferences = () => {
    saveConsent(preferences);
  };

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 p-4"
      >
        <div className="container mx-auto max-w-4xl">
          <div className="bg-card border border-border rounded-xl shadow-lg p-6">
            {!showSettings ? (
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <Cookie className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{t('cookie.title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('cookie.description')}{" "}
                    <Link to="/privacy" className="text-primary hover:underline">{t('cookie.learnMore')}</Link>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                  <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                    <Settings className="h-4 w-4 mr-2" />
                    {t('cookie.settings')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={acceptEssential}>
                    {t('cookie.essentialOnly')}
                  </Button>
                  <Button size="sm" onClick={acceptAll}>
                    {t('cookie.acceptAll')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    {t('cookie.preferences')}
                  </h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">{t('cookie.essential')}</p>
                      <p className="text-xs text-muted-foreground">{t('cookie.essentialDesc')}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{t('cookie.alwaysOn')}</span>
                  </div>

                  <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-foreground">{t('cookie.analytics')}</p>
                      <p className="text-xs text-muted-foreground">{t('cookie.analyticsDesc')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.analytics}
                      onChange={(e) => setPreferences(p => ({ ...p, analytics: e.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-foreground">{t('cookie.marketing')}</p>
                      <p className="text-xs text-muted-foreground">{t('cookie.marketingDesc')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.marketing}
                      onChange={(e) => setPreferences(p => ({ ...p, marketing: e.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={acceptEssential}>
                    {t('cookie.essentialOnly')}
                  </Button>
                  <Button onClick={savePreferences}>
                    {t('cookie.savePreferences')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
