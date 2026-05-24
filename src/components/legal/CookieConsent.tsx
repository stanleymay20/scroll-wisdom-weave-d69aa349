import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie, Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

function CookieConsentInner() {
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
      const timer = setTimeout(() => setShowBanner(true), 2500);
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
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-0 left-0 right-0 z-50 px-2 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] sm:pb-4"
    >
      <div className="container mx-auto max-w-4xl">
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-xl sm:rounded-2xl shadow-2xl p-3 sm:p-6">
          {!showSettings ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <div className="hidden sm:flex h-10 w-10 rounded-full bg-primary/10 items-center justify-center flex-shrink-0">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-0.5 text-sm sm:text-base flex items-center gap-2">
                  <Cookie className="h-4 w-4 text-primary sm:hidden" />
                  {t('cookie.title')}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-snug line-clamp-2 sm:line-clamp-none">
                  {t('cookie.description')}{" "}
                  <Link to="/privacy" className="text-primary hover:underline font-medium">{t('cookie.learnMore')}</Link>
                </p>
              </div>
              <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto sm:flex-nowrap">
                <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} className="px-2 sm:flex-none" aria-label={t('cookie.settings')}>
                  <Settings className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('cookie.settings')}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={acceptEssential} className="flex-1 sm:flex-none text-xs sm:text-sm">
                  {t('cookie.essentialOnly')}
                </Button>
                <Button variant="gold" size="sm" onClick={acceptAll} className="flex-1 sm:flex-none text-xs sm:text-sm">
                  {t('cookie.acceptAll')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm sm:text-base">
                  <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  {t('cookie.preferences')}
                </h3>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border/50">
                  <div>
                    <p className="font-medium text-foreground text-sm">{t('cookie.essential')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.essentialDesc')}</p>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{t('cookie.alwaysOn')}</span>
                </div>

                <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer border border-border/50 hover:border-border transition-colors">
                  <div>
                    <p className="font-medium text-foreground text-sm">{t('cookie.analytics')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.analyticsDesc')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences(p => ({ ...p, analytics: e.target.checked }))}
                    className="h-4 w-4 accent-primary rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer border border-border/50 hover:border-border transition-colors">
                  <div>
                    <p className="font-medium text-foreground text-sm">{t('cookie.marketing')}</p>
                    <p className="text-xs text-muted-foreground">{t('cookie.marketingDesc')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(e) => setPreferences(p => ({ ...p, marketing: e.target.checked }))}
                    className="h-4 w-4 accent-primary rounded"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={acceptEssential}>
                  {t('cookie.essentialOnly')}
                </Button>
                <Button variant="gold" size="sm" onClick={savePreferences}>
                  {t('cookie.savePreferences')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const CookieConsent = memo(CookieConsentInner);
