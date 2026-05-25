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

// Memoized skeleton for performance
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

// Memoized section header
const SectionHeader = memo(forwardRef<HTMLDivElement, { title: string; linkTo: string }>(function SectionHeader({ title, linkTo }, ref) {
  return (
    <div ref={ref} className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
      <Link 
        to={linkTo} 
        className="flex items-center gap-1 text-sm text-primary active:text-primary/80"
      >
        See all
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}));

// Static categories - no computation needed
const QUICK_CATEGORIES = ["Technology", "Science", "Business", "History", "Psychology", "Philosophy"] as const;

export function MobileHome() {
  // UI shell renders immediately with these defaults
  const [lastAdded, setLastAdded] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  // Deferred data fetch - runs AFTER first paint
  const fetchData = useCallback(async () => {
    try {
      // Try cache first for instant display
      const cachedBooks = apiCache.get<Book[]>(cacheKeys.featuredBooks());
      if (cachedBooks) {
        setLastAdded(cachedBooks);
        setLoading(false);
      }

      // Cache-first for last added books - REDUCED COUNT
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
        60000 // 60 second cache
      );
      
      setLastAdded(booksResult);
    } catch (error) {
      console.error("Error fetching mobile home data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // CONTRACT 5: Defer data fetch to after first paint and track SLA
  // FIXED: Use requestAnimationFrame chain for faster paint
  useEffect(() => {
    // Mark first content immediately (skeletons are visible)
    markFirstContent('MobileHome');
    
    // Use double RAF to ensure we're after paint, then fetch immediately
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

  // Main content - padding handled by MobileLayout wrapper
  return (
    <div className="px-4 pt-2">
      {/* Welcome Hero for Mobile */}
      <section className="mb-6 pt-2" aria-labelledby="mobile-hero-title">
        <h1 id="mobile-hero-title" className="font-display text-[26px] leading-tight font-bold text-foreground mb-1 tracking-tight">
          Generate. Read. Master.
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          AI-native books with verified mastery proofs.
        </p>
        <div className="flex gap-2.5 w-full">
          <Link
            to="/generate"
            className="flex-1 inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
          >
            Generate a book
          </Link>
          <Link
            to="/store"
            className="flex-1 inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-border text-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Browse library
          </Link>
        </div>
      </section>

      {/* Continue Reading Widget */}
      <section className="mb-6" aria-label="Continue reading">
        <ContinueReadingWidget />
      </section>

      {/* Last Added Section */}
      <section className="mb-8" aria-labelledby="recently-added-heading">
        <SectionHeader title="Recently Added" linkTo="/store" />
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
            <h3 className="text-base font-semibold text-foreground mb-1">No books yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Tap <span className="font-semibold text-primary">+</span> below to create your first book.
            </p>
            <Link
              to="/generate"
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              Generate now
            </Link>
          </div>
        )}
      </section>

      {/* Quick Categories */}
      <section aria-labelledby="categories-heading">
        <SectionHeader title="Browse Categories" linkTo="/explore" />
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide" role="list">
          {QUICK_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              to={`/explore?category=${cat.toLowerCase()}`}
              role="listitem"
              className="flex-shrink-0 inline-flex items-center min-h-11 px-4 rounded-full bg-muted/50 text-sm font-medium text-foreground border border-border/60 active:bg-primary/10 active:text-primary active:border-primary/30 transition-colors"
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
