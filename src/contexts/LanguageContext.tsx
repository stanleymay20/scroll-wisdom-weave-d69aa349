import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, getStoredLanguage, setStoredLanguage, t as translate, LANGUAGES } from '@/lib/i18n';
import {
  englishCommercialTranslations,
  isCommercialTranslationKey,
  loadCommercialTranslations,
  translateCommercial,
} from '@/lib/commercialI18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return getStoredLanguage();
    } catch {
      return 'en';
    }
  });
  const [, setCommercialRevision] = useState(0);

  useEffect(() => {
    const lang = LANGUAGES.find(l => l.code === language);
    if (lang) {
      document.documentElement.dir = lang.dir;
      document.documentElement.lang = lang.code;
    }

    let active = true;
    void loadCommercialTranslations(language)
      .then(() => {
        if (active) setCommercialRevision(revision => revision + 1);
      })
      .catch((error) => {
        console.error(`[i18n] Failed to load commercial locale ${language}`, error);
      });

    return () => {
      active = false;
    };
  }, [language]);

  const setLanguage = (lang: Language) => {
    setStoredLanguage(lang);
    setLanguageState(lang);
  };

  // Commercial conversion copy is code-split by locale so adding supported
  // languages cannot silently blow the GA JavaScript budget. Until the selected
  // locale chunk resolves, commercial keys fail safely to the English source of
  // truth; legacy product keys continue to use the existing full dictionary.
  const t = (key: string) => {
    const commercial = translateCommercial(key, language);
    if (commercial) return commercial;
    if (isCommercialTranslationKey(key)) return englishCommercialTranslations[key];
    return translate(key, language);
  };

  const dir = LANGUAGES.find(l => l.code === language)?.dir || 'ltr';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
