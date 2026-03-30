/**
 * CONTRACT 5 — Explore Page Performance
 * 
 * Cache-first strategy with skeleton-first loading.
 * First meaningful content ≤ 1.5s
 * Fully interactive ≤ 2.0s
 * Pull-to-refresh for native mobile UX
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout, MobileBookCard } from "@/components/mobile";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { GentleOfflineBanner } from "@/components/ui/gentle-offline-banner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiCache } from "@/lib/cache";
import { usePagePerformance } from "@/lib/performance";
import { markFirstContent, markInteractive } from "@/lib/contract5";

const CATEGORIES = [
  "all",
  "technology",
  "science",
  "business",
  "finance",
  "economics",
  "medicine",
  "law",
  "governance",
  "history",
  "philosophy",
  "psychology",
  "health",
  "arts",
  "fiction",
  "non_fiction",
  "poetry",
];

interface Book {
  id: string;
  title: string;
  description: string | null;
  category: string;
  cover_image_url: string | null;
  total_chapters: number | null;
  book_type: string;
  created_at?: string;
}

type SortOption = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'chapters';

// CONTRACT 4: Skeleton-first loading for book grids
function BookGridSkeleton({ count = 8, mobile = false }: { count?: number; mobile?: boolean }) {
  if (mobile) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[3/4] rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[3/4] rounded-xl" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Mobile Explore Content with Pull-to-Refresh
function MobileExploreContent({
  books,
  filteredBooks,
  isLoading,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  handleCategoryChange,
  getCategoryLabel,
  sortBy,
  handleSortChange,
  onRefresh,
}: {
  books: Book[];
  filteredBooks: Book[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedCategory: string;
  handleCategoryChange: (c: string) => void;
  getCategoryLabel: (c: string) => string;
  sortBy: SortOption;
  handleSortChange: (s: SortOption) => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useLanguage();
  
  // CONTRACT 5 - Rule 5.1: Pull-to-refresh for native mobile UX
  const pullToRefresh = usePullToRefresh({
    onRefresh,
    threshold: 80,
    enabled: !isLoading,
  });

  return (
    <div 
      ref={pullToRefresh.containerRef}
      className="px-4 py-4 min-h-screen overflow-y-auto"
    >
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullToRefresh.pullDistance}
        progress={pullToRefresh.progress}
        isRefreshing={pullToRefresh.isRefreshing}
        isPulling={pullToRefresh.isPulling}
      />
      
      {/* CONTRACT 5.5: Gentle Offline Banner */}
      <GentleOfflineBanner compact className="mb-4 rounded-lg" />
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">
          Explore
        </h1>
        <p className="text-muted-foreground text-sm">
          Discover books across all categories
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search books..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Sort + Categories row */}
      <div className="flex items-center gap-2 mb-4">
        <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="title_asc">A-Z</SelectItem>
            <SelectItem value="title_desc">Z-A</SelectItem>
            <SelectItem value="chapters">Most Chapters</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Categories - Horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide mb-4">
        {CATEGORIES.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "gold" : "muted"}
            size="sm"
            onClick={() => handleCategoryChange(category)}
            className="flex-shrink-0 capitalize text-xs"
          >
            {getCategoryLabel(category)}
          </Button>
        ))}
      </div>

      {/* CONTRACT 4: Skeleton-first loading */}
      {isLoading ? (
        <BookGridSkeleton count={6} mobile />
      ) : filteredBooks.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {filteredBooks.map((book) => (
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
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {books.length === 0 ? "No books yet" : "No books match your search"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Explore() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || "all"
  );
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) || 'newest'
  );
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // CONTRACT 5: Track TTI
  usePagePerformance('Explore');

  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      setSelectedCategory(category);
    }
    // CONTRACT 5: Mark first content when skeleton renders
    markFirstContent('Explore');
  }, [searchParams]);

  // CONTRACT 5: Mark interactive when data loads
  useEffect(() => {
    if (!isLoading) {
      markInteractive('Explore');
    }
  }, [isLoading]);

  // CONTRACT 4: Cache-first data fetching with instant skeleton
  const fetchBooks = useCallback(async () => {
    const cacheKey = 'explore:books:published';
    
    // INSTANT: Try cache first for immediate display (non-blocking)
    const cached = apiCache.get<Book[]>(cacheKey);
    if (cached && cached.length > 0) {
      setBooks(cached);
      setIsLoading(false);
    }
    
    // BACKGROUND: Fetch fresh data without blocking UI
    try {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, description, category, cover_image_url, total_chapters, book_type, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(isMobile ? 30 : 100);

      if (error) throw error;
      
      const newBooks = data || [];
      setBooks(newBooks);
      setIsLoading(false);
      apiCache.set(cacheKey, newBooks, 2 * 60 * 1000); // 2 min cache
    } catch (error) {
      console.error("Error fetching books:", error);
      // CONTRACT 4: Graceful degradation - keep cached data if fetch fails
      setIsLoading(false);
    }
  }, [isMobile]);

  // CONTRACT 5: Defer fetch to after first paint
  useEffect(() => {
    // Use requestIdleCallback/setTimeout to not block skeleton render
    const timeoutId = setTimeout(fetchBooks, 0);
    return () => clearTimeout(timeoutId);
  }, [fetchBooks]);

  // Filter and sort books
  const filteredBooks = useMemo(() => {
    let result = books.filter((book) => {
      const matchesCategory = selectedCategory === "all" || 
        book.category.toLowerCase().replace(/\s+/g, '_') === selectedCategory.toLowerCase().replace(/\s+/g, '_') ||
        book.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
    
    // Sort
    switch (sortBy) {
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        break;
      case 'title_asc':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title_desc':
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'chapters':
        result.sort((a, b) => (b.total_chapters || 0) - (a.total_chapters || 0));
        break;
      case 'newest':
      default:
        result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
    }
    
    return result;
  }, [books, selectedCategory, searchQuery, sortBy]);

  const handleSortChange = (sort: SortOption) => {
    setSortBy(sort);
    if (sort === 'newest') {
      searchParams.delete("sort");
    } else {
      searchParams.set("sort", sort);
    }
    setSearchParams(searchParams);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (category === "all") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", category);
    }
    setSearchParams(searchParams);
  };

  const getCategoryLabel = (category: string) => {
    if (category === "all") return t('explore.allCategories');
    const key = `categories.${category}`;
    return t(key);
  };

  // Mobile layout with persistent shell and pull-to-refresh
  if (isMobile) {
    return (
      <MobileLayout>
        <MobileExploreContent
          books={books}
          filteredBooks={filteredBooks}
          isLoading={isLoading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCategory={selectedCategory}
          handleCategoryChange={handleCategoryChange}
          getCategoryLabel={getCategoryLabel}
          sortBy={sortBy}
          handleSortChange={handleSortChange}
          onRefresh={fetchBooks}
        />
      </MobileLayout>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
              {t('explore.title')} <span className="text-gradient-gold">{t('explore.titleHighlight')}</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              {t('explore.subtitle')}
            </p>
          </motion.div>

          {/* Search & Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder={t('explore.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/50 border-border/50 focus:border-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
              
              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
                <SelectTrigger className="w-[180px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="title_asc">Title A-Z</SelectItem>
                  <SelectItem value="title_desc">Title Z-A</SelectItem>
                  <SelectItem value="chapters">Most Chapters</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "gold" : "muted"}
                  size="sm"
                  onClick={() => handleCategoryChange(category)}
                  className="capitalize"
                >
                  {getCategoryLabel(category)}
                </Button>
              ))}
            </div>
          </motion.div>

          {/* CONTRACT 4: Skeleton-first loading */}
          {isLoading ? (
            <BookGridSkeleton count={8} />
          ) : filteredBooks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredBooks.map((book, index) => (
                <BookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  description={book.description || undefined}
                  category={book.category}
                  coverImageUrl={book.cover_image_url || undefined}
                  totalChapters={book.total_chapters || 0}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p className="text-muted-foreground text-lg">
                {books.length === 0 
                  ? t('explore.noBooks')
                  : t('explore.noBooksFound')}
              </p>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
