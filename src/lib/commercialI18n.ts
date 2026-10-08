import type { Language } from "@/lib/i18n";
import commercialEnglish from "@/lib/locales/commercial.en";

export type CommercialCatalog = Record<string, string>;
export type CommercialTranslationKey = keyof typeof commercialEnglish;

const loadedCatalogs = new Map<Language, CommercialCatalog>([
  ["en", commercialEnglish],
]);

const localeLoaders: Record<Exclude<Language, "en">, () => Promise<{ default: CommercialCatalog }>> = {
  fr: () => import("@/lib/locales/commercial.fr"),
  de: () => import("@/lib/locales/commercial.de"),
  es: () => import("@/lib/locales/commercial.es"),
  ar: () => import("@/lib/locales/commercial.ar"),
  sw: () => import("@/lib/locales/commercial.sw"),
};

export const englishCommercialTranslations = commercialEnglish;

export function isCommercialTranslationKey(key: string): key is CommercialTranslationKey {
  return Object.prototype.hasOwnProperty.call(commercialEnglish, key);
}

export function getLoadedCommercialTranslations(language: Language): CommercialCatalog | undefined {
  return loadedCatalogs.get(language);
}

export async function loadCommercialTranslations(language: Language): Promise<CommercialCatalog> {
  const cached = loadedCatalogs.get(language);
  if (cached) return cached;

  if (language === "en") return commercialEnglish;

  const module = await localeLoaders[language]();
  const catalog = module.default;
  loadedCatalogs.set(language, catalog);
  return catalog;
}

export function translateCommercial(key: string, language: Language): string | undefined {
  const catalog = loadedCatalogs.get(language);
  return catalog?.[key];
}
