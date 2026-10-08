import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import commercialEnglish from "@/lib/locales/commercial.en";
import commercialFrench from "@/lib/locales/commercial.fr";
import commercialGerman from "@/lib/locales/commercial.de";
import commercialSpanish from "@/lib/locales/commercial.es";
import commercialArabic from "@/lib/locales/commercial.ar";
import commercialSwahili from "@/lib/locales/commercial.sw";
import { loadCommercialTranslations } from "@/lib/commercialI18n";

const catalogs = {
  en: commercialEnglish,
  fr: commercialFrench,
  de: commercialGerman,
  es: commercialSpanish,
  ar: commercialArabic,
  sw: commercialSwahili,
} as const;

const LANGUAGES = ["en", "fr", "de", "es", "ar", "sw"] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("commercial i18n contract", () => {
  it("keeps every commercial locale in exact key parity with English", () => {
    const englishKeys = Object.keys(catalogs.en).sort();

    for (const language of LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(Object.keys(catalog).sort(), `${language} key parity`).toEqual(englishKeys);
      for (const key of englishKeys) {
        expect(String(catalog[key]).trim(), `${language}:${key}`).not.toBe("");
      }
    }
  });

  it("has genuine localized copy for primary conversion text", () => {
    const primaryKeys = [
      "home.current.titleLead",
      "home.current.titleHighlight",
      "home.current.ctaCreate",
      "home.current.ctaExplore",
      "mobile.home.title",
      "nav.publish",
    ] as const;

    for (const language of LANGUAGES.filter((code) => code !== "en")) {
      for (const key of primaryKeys) {
        expect(catalogs[language][key]).not.toBe(catalogs.en[key]);
      }
    }
  });

  it("lazy-loads non-English commercial locales instead of inflating the entry bundle", async () => {
    for (const language of LANGUAGES.filter((code) => code !== "en")) {
      const catalog = await loadCommercialTranslations(language);
      expect(catalog["home.current.ctaCreate"]).toBe(catalogs[language]["home.current.ctaCreate"]);
    }

    const loaderSource = source("src/lib/commercialI18n.ts");
    expect(loaderSource).toContain('import("@/lib/locales/commercial.fr")');
    expect(loaderSource).not.toContain("commercialTranslations = {");
  });

  it("does not bypass i18n on the desktop conversion shell", () => {
    const hero = source("src/components/home/HeroSection.tsx");
    const nav = source("src/components/layout/Navbar.tsx");

    expect(hero).toContain("useLanguage");
    expect(hero).toContain('t("home.current.titleLead")');
    expect(hero).not.toContain("From idea to{\" \"}");
    expect(hero).not.toContain(">Create a Book<");

    expect(nav).toContain('t("nav.explore")');
    expect(nav).toContain('t("nav.publish")');
    expect(nav).toContain('t("nav.pricing")');
    expect(nav).toContain("<LanguageSwitcher />");
  });

  it("exposes language switching and localized conversion copy on mobile", () => {
    const header = source("src/components/mobile/MobileHeader.tsx");
    const home = source("src/components/mobile/MobileHome.tsx");

    expect(header).toContain("<LanguageSwitcher />");
    expect(header).toContain('t("mobile.header.search")');
    expect(home).toContain('t("mobile.home.title")');
    expect(home).toContain('t("mobile.home.create")');
    expect(home).not.toContain("Create. Read. Master.");
  });

  it("preserves the selected book language from UI through outline and chapter generation", () => {
    const generatePage = source("src/pages/Generate.tsx");
    const bookDetail = source("src/pages/BookDetail.tsx");
    const generateBook = source("supabase/functions/generate-book/index.ts");
    const generateChapter = source("supabase/functions/generate-chapter/index.ts");

    expect(generatePage).toMatch(/body:\s*\{[\s\S]*?\blanguage,/);
    expect(bookDetail).toContain('language: book.language || "en"');
    expect(generateBook).toContain("const VALID_LANGUAGES = ['en', 'fr', 'de', 'es', 'ar', 'sw', 'pt']");
    expect(generateBook).toContain("Create a book outline in ${languageName}");
    expect(generateBook).toContain("All in ${languageName}");
    expect(generateChapter).toContain("LANGUAGE: Write EXCLUSIVELY in ${languageName}.");
  });
});
