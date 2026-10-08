/**
 * CONTRACT 5 — MOBILE HOME PERFORMANCE
 *
 * Renders INSTANTLY with skeletons.
 * Data fetches in background AFTER first paint.
 * Uses cache-first strategy.
 * SLA: First content ≤ 1.5s, Interactive ≤ 2.0s
 */

import { useEffect, useState, useCallback, memo, forwardRef } from "react";
import { ChevronRight, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MobileBookCard } from "./MobileBookCard";
import { ContinueReadingWidget } from "@/components/home/ContinueReadingWidget";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiCache, cacheKeys } from "@/lib/cache";
import { MOBILE_DATA_LIMITS } from "@/lib/performanceContracts";
import { markFirstContent, markInteractive } from "@/lib/contract5";

interface Book {
  id: string;
  title: string;
  cover_image_url: string | null;
  category: string;
  book_type: string;
  created_at: string | null;
}

const BookGridSkeleton = memo(function BookGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[3/4] rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
});

const SectionHeader = memo(forwardRef<HTMLDivElement, { title: string; linkTo: string; seeAllLabel: string }>(
  function SectionHeader({ title, linkTo, seeAllLabel }, ref) {
    return (
      <div ref={ref} className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
        <Link
          to={linkTo}
          className="flex items-center gap-1 text-sm text-primary active:text-primary/80"
        >
          {seeAllLabel}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  },
));

const QUICK_CATEGORIES = [
  { slug: "technology", key: "categories.technology" },
  { slug: "science", key: "categories.science" },
  { slug: "business", key: "categories.business" },
  { slug: "history", key: "categories.history" },
  { slug: "psychology", key: "categories.psychology" },
  { slug: "philosophy", key: "categories.philosophy" },
] as const;

export function MobileHome() {
  const { t } = useLanguage();
  const [lastAdded, setLastAdded] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const cachedBooks = apiCache.get<Book[]>(cacheKeys.featuredBooks());
      if (cachedBooks) {
        setLastAdded(cachedBooks);
        setLoading(false);
      }

      const booksResult = await apiCache.getOrSet<Book[]>(
        cacheKeys.featuredBooks(),
        async () => {
          const { data } = await supabase
            .from("books")
            .select("id, title, cover_image_url, category, book_type, created_at")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(MOBILE_DATA_LIMITS.recentBooksCount);
          return data || [];
        },
        60000,
      );

      setLastAdded(booksResult);
    } catch (error) {
      console.error("Error fetching mobile home data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    markFirstContent('MobileHome');

    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        fetchData().then(() => {
          if (!cancelled) {
            markInteractive('MobileHome');
          }
        });
      });
    });

    return () => { cancelled = true; };
  }, [fetchData]);

  return (
    <div className="px-4 pt-2">
      <section className="mb-6 pt-2" aria-labelledby="mobile-hero-title">
        <h1 id="mobile-hero-title" className="font-display text-[26px] leading-tight font-bold text-foreground mb-1 tracking-tight">
          {t("mobile.home.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {t("mobile.home.subtitle")}
        </p>
        <div className="flex gap-2.5 w-full">
          <Link
            to="/generate"
            className="flex-1 inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
          >
            {t("mobile.home.create")}
          </Link>
          <Link
            to="/explore"
            className="flex-1 inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-border text-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            {t("mobile.home.explore")}
          </Link>
        </div>
      </section>

      <section className="mb-6" aria-label={t("mobile.home.continueReading")}>
        <ContinueReadingWidget />
      </section>

      <section className="mb-8" aria-labelledby="recently-added-heading">
        <div id="recently-added-heading">
          <SectionHeader title={t("mobile.home.recent")} linkTo="/explore" seeAllLabel={t("mobile.home.seeAll")} />
        </div>
        {loading ? (
          <BookGridSkeleton count={6} />
        ) : lastAdded.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {lastAdded.map((book) => (
              <MobileBookCard
                key={book.id}
                id={book.id}
                title={book.title}
                coverImageUrl={book.cover_image_url || undefined}
                category={book.category}
                bookType={book.book_type}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl bg-muted/20 border border-border/50 px-6">
            <BookOpen className="h-10 w-10 text-primary/40 mx-auto mb-3" aria-hidden="true" />
            <h3 className="text-base font-semibold text-foreground mb-1">{t("mobile.home.noBooks")}</h3>
            <p className="text-muted-foreground text-sm mb-4">{t("mobile.home.noBooksDesc")}</p>
            <Link
              to="/generate"
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              {t("mobile.home.createFirst")}
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="categories-heading">
        <div id="categories-heading">
          <SectionHeader title={t("mobile.home.categories")} linkTo="/explore" seeAllLabel={t("mobile.home.seeAll")} />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide" role="list">
          {QUICK_CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              to={`/explore?category=${category.slug}`}
              role="listitem"
              className="flex-shrink-0 inline-flex items-center min-h-11 px-4 rounded-full bg-muted/50 text-sm font-medium text-foreground border border-border/60 active:bg-primary/10 active:text-primary active:border-primary/30 transition-colors"
            >
              {t(category.key)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
