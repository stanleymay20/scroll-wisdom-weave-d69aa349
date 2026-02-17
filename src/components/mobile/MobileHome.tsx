/**
 * CONTRACT 5 — MOBILE HOME PERFORMANCE
 * 
 * Renders INSTANTLY with skeletons.
 * Data fetches in background AFTER first paint.
 * Uses cache-first strategy.
 * SLA: First content ≤ 1.5s, Interactive ≤ 2.0s
 */

import { useEffect, useState, useCallback, memo } from "react";
import { ChevronRight } from "lucide-react";
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
const SectionHeader = memo(function SectionHeader({ title, linkTo }: { title: string; linkTo: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
      <Link 
        to={linkTo} 
        className="flex items-center gap-1 text-sm text-scroll-gold active:text-scroll-gold-light"
      >
        See all
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
});

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

  // Main content - note: padding-top is handled by MobileLayout wrapper
  return (
    <div className="min-h-screen bg-background pb-24 px-4 pt-4">
      {/* Welcome Hero for Mobile */}
      <section className="mb-4 text-center py-3">
        <h1 className="font-display text-xl font-bold text-foreground mb-1">
          Your Academic Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload → Read → Quiz → Certificate
        </p>
      </section>

      {/* Continue Reading Widget - Single instance, no duplication */}
      <section className="mb-6">
        <ContinueReadingWidget />
      </section>

      {/* Last Added Section */}
      <section className="mb-8">
        <SectionHeader title="Recently Added" linkTo="/explore" />
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
          <div className="text-center py-12 rounded-xl bg-muted/30 border border-dashed border-border">
            <p className="text-muted-foreground text-sm">No books yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Tap the + button to create your first book
            </p>
          </div>
        )}
      </section>

      {/* Quick Categories */}
      <section>
        <SectionHeader title="Browse Categories" linkTo="/explore" />
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {QUICK_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              to={`/explore?category=${cat.toLowerCase()}`}
              className="flex-shrink-0 px-4 py-2.5 rounded-full bg-muted/50 text-sm font-medium text-foreground border border-border/50 hover:bg-scroll-gold/10 hover:text-scroll-gold hover:border-scroll-gold/30 active:scale-95 transition-all"
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
