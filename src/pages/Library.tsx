/**
 * CONTRACT 5B-1: Library Entry Speed
 * 
 * The Library screen must feel instant on mobile (PWA).
 * 
 * SUCCESS CRITERIA:
 * - ≤100ms: user sees structure (skeleton)
 * - ≤1.0s perceived: library looks usable (cached data)
 * - ≤1.5s actual: data fully hydrated
 * - 0 blank screens
 * - 0 full-page spinners
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/mobile";
import { LibraryBookCard } from "@/components/books/LibraryBookCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  LibraryPageSkeleton,
  BookCardSkeleton,
  LibraryStatsSkeleton,
} from "@/components/ui/page-skeletons";
import { 
  Library as LibraryIcon, 
  BookOpen, 
  Plus, 
  RefreshCw, 
  Search,
  SlidersHorizontal,
  BookCheck,
  Clock,
  Sparkles,
  AlertTriangle,
  CloudOff
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLibraryLimits } from "@/hooks/useLibraryLimits";
import { useLibraryData } from "@/hooks/useLibraryData";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { GentleOfflineBanner } from "@/components/ui/gentle-offline-banner";
import { PullToRefreshIndicator } from "@/components/ui/pull-to-refresh";
import { cn } from "@/lib/utils";

// Stats card component
function StatCard({ icon: Icon, label, value, color }: { 
  icon: typeof BookOpen; 
  label: string; 
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
      <div className={cn("p-3 rounded-lg", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// Library limit banner component
function LibraryLimitBanner({ 
  currentCount, 
  maxLimit, 
  remaining, 
  isUnlimited 
}: { 
  currentCount: number; 
  maxLimit: number; 
  remaining: number;
  isUnlimited: boolean;
}) {
  if (isUnlimited) return null;
  
  const percentage = (currentCount / maxLimit) * 100;
  const isNearLimit = remaining <= 3 && remaining > 0;
  const isAtLimit = remaining === 0;

  if (!isAtLimit && !isNearLimit) return null;

  return (
    <Alert variant={isAtLimit ? "destructive" : "default"} className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {isAtLimit ? "Library Full" : "Library Almost Full"}
      </AlertTitle>
      <AlertDescription>
        {isAtLimit 
          ? `You've reached your limit of ${maxLimit} books. Remove some books to add new ones.`
          : `You have ${remaining} slot${remaining !== 1 ? 's' : ''} remaining (${currentCount}/${maxLimit} books).`
        }
        <div className="mt-2">
          <Progress value={percentage} className="h-2" />
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Mobile Library Content Component with Pull-to-Refresh
function MobileLibraryContent({
  items,
  filteredItems,
  loadState,
  stats,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterCategory,
  setFilterCategory,
  sortBy,
  setSortBy,
  categories,
  handleRemoveBook,
  hasMore,
  isLoadingMore,
  loadMore,
  libraryLimits,
  onRefresh,
  error
}: {
  items: any[];
  filteredItems: any[];
  loadState: string;
  stats: { total: number; reading: number; completed: number };
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterStatus: "all" | "reading" | "completed";
  setFilterStatus: (v: "all" | "reading" | "completed") => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  categories: string[];
  handleRemoveBook: (id: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  libraryLimits: ReturnType<typeof useLibraryLimits>;
  onRefresh: () => Promise<void>;
  error: string | null;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isLoading = loadState === 'skeleton';
  const isHydrating = loadState === 'hydrating';
  
  // CONTRACT 5 - Rule 5.1: Pull-to-refresh for native mobile UX
  const pullToRefresh = usePullToRefresh({
    onRefresh,
    threshold: 80,
    enabled: !isLoading,
  });

  // RULE 5B-1.1: Show skeleton IMMEDIATELY
  if (isLoading && items.length === 0) {
    return <LibraryPageSkeleton isMobile />;
  }

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
      <GentleOfflineBanner 
        showingCached={loadState === 'offline-with-cache'} 
        compact 
        className="mb-4 rounded-lg" 
      />
      
      {/* Hydrating indicator - subtle, non-blocking */}
      {isHydrating && (
        <div className="flex items-center justify-center gap-2 mb-4 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </div>
      )}
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">
          {t('library.title')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {libraryLimits.isUnlimited 
            ? `${stats.total} books in your library`
            : `${stats.total} / ${libraryLimits.maxLimit} books`
          }
        </p>
      </div>

      {/* Library Limit Banner */}
      <LibraryLimitBanner 
        currentCount={libraryLimits.currentCount}
        maxLimit={libraryLimits.maxLimit}
        remaining={libraryLimits.remaining}
        isUnlimited={libraryLimits.isUnlimited}
      />

      {/* Quick Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card rounded-lg p-3 text-center border border-border/50">
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center border border-border/50">
            <p className="text-lg font-bold text-amber-500">{stats.reading}</p>
            <p className="text-xs text-muted-foreground">Reading</p>
          </div>
          <div className="bg-card rounded-lg p-3 text-center border border-border/50">
            <p className="text-lg font-bold text-green-500">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Done</p>
          </div>
        </div>
      )}

      {/* Search */}
      {items.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Filter Tabs */}
      {items.length > 0 && (
        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="mb-4">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="reading" className="flex-1">Reading</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">Done</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Category Filter & Sort */}
      {items.length > 0 && (
        <div className="flex gap-2 mb-6">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat} className="capitalize">
                  {cat.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[130px]">
              <SlidersHorizontal className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="title">A-Z</SelectItem>
              <SelectItem value="title-desc">Z-A</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Content */}
      {error && items.length === 0 ? (
        // CONTRACT 5.5: Only show error if we have NO data at all
        <div className="text-center py-12">
          <CloudOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">Couldn't load library</p>
          <p className="text-sm text-muted-foreground/70 mb-4">Check your connection and try again</p>
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      ) : loadState === 'offline-empty' ? (
        <div className="text-center py-12">
          <CloudOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-2">You're offline</p>
          <p className="text-sm text-muted-foreground/70">Your library will appear when you reconnect</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-primary/50 mx-auto mb-4" />
          <h2 className="font-semibold text-lg mb-2">Your library is empty</h2>
          <p className="text-muted-foreground text-sm mb-6">
            Start exploring or create your first book
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => navigate("/explore")}>
              <Plus className="h-4 w-4 mr-2" />
              Explore Books
            </Button>
            <Button variant="outline" onClick={() => navigate("/generate")}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Book
            </Button>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No books found</p>
          <Button variant="outline" onClick={() => { setSearchQuery(""); setFilterStatus("all"); setFilterCategory("all"); setSortBy("recent"); }}>
            Clear Filters
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.map((item, index) => (
              <LibraryBookCard
                key={item.id}
                libraryId={item.id}
                bookId={item.books.id}
                title={item.books.title}
                description={item.books.description}
                category={item.books.category}
                coverImageUrl={item.books.cover_image_url}
                totalChapters={item.books.total_chapters}
                progressPercent={item.progress_percent}
                lastReadChapter={item.last_read_chapter}
                onRemove={handleRemoveBook}
                index={index}
              />
            ))}
          </div>
          
          {/* Load More */}
          {hasMore && !isLoadingMore && filteredItems.length === items.length && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={loadMore}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load More
              </Button>
            </div>
          )}
          
          {isLoadingMore && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {[1, 2].map((i) => (
                <BookCardSkeleton key={i} mobile />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Library() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "reading" | "completed">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const navigate = useNavigate();
  const { toast } = useToast();
  const libraryLimits = useLibraryLimits();

  // CONTRACT 5B-1: Use new data hook with skeleton-first, cache-first strategy
  const {
    items,
    stats,
    loadState,
    isLoading,
    isHydrating,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    refresh,
    removeItem
  } = useLibraryData({
    isMobile,
    userId: user?.id
  });

  // Auth check - deferred to not block skeleton
  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        if (!session?.user) {
          navigate("/auth");
          return;
        }
        
        setUser(session.user);
      } catch (error) {
        console.error("Auth error:", error);
        if (mounted) navigate("/auth");
      }
    };
    
    // Defer auth check to not block skeleton render
    setTimeout(checkAuth, 0);

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Extract unique categories from library items
  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(item => {
      if (item.books.category) {
        cats.add(item.books.category);
      }
    });
    return Array.from(cats).sort();
  }, [items]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.books.title.toLowerCase().includes(query) ||
        item.books.category.toLowerCase().includes(query) ||
        item.books.description?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filterCategory && filterCategory !== "all") {
      result = result.filter(item => item.books.category === filterCategory);
    }

    // Status filter - "reading" = any book not completed (matches stats query)
    if (filterStatus === "reading") {
      result = result.filter(i => (i.progress_percent || 0) > 0 && (i.progress_percent || 0) < 100);
    } else if (filterStatus === "completed") {
      result = result.filter(i => (i.progress_percent || 0) >= 100);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.books.title.localeCompare(b.books.title);
        case "title-desc":
          return b.books.title.localeCompare(a.books.title);
        case "progress":
          return (b.progress_percent || 0) - (a.progress_percent || 0);
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [items, searchQuery, filterCategory, filterStatus, sortBy]);

  const handleRemoveBook = useCallback((libraryId: string) => {
    removeItem(libraryId);
    libraryLimits.refresh();
  }, [removeItem, libraryLimits]);

  // Mobile layout with persistent shell
  if (isMobile) {
    // CONTRACT 5B-1: Show content with cached data or skeleton immediately
    // Don't block on auth - useLibraryData loads cache independently
    return (
      <MobileLayout>
        <MobileLibraryContent
          items={items}
          filteredItems={filteredItems}
          loadState={!user ? 'skeleton' : loadState}
          stats={stats}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          sortBy={sortBy}
          setSortBy={setSortBy}
          categories={categories}
          handleRemoveBook={handleRemoveBook}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMore={loadMore}
          libraryLimits={libraryLimits}
          onRefresh={refresh}
          error={error}
        />
      </MobileLayout>
    );
  }

  // Desktop: Show skeleton or content based on load state
  // Don't block on auth if we have cached data
  const showDesktopSkeleton = !user && items.length === 0;
  
  if (showDesktopSkeleton) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <LibraryPageSkeleton />
        <Footer />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-24">
        {/* Hydrating indicator */}
        {isHydrating && (
          <div className="flex items-center justify-center gap-2 mb-4 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Refreshing library...</span>
          </div>
        )}
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-gradient-gold p-3 rounded-xl">
              <LibraryIcon className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-gradient-gold mb-4">
            {t('library.title')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {libraryLimits.isUnlimited 
              ? t('library.subtitle')
              : `${stats.total} / ${libraryLimits.maxLimit} books • ${t('library.subtitle')}`
            }
          </p>
        </motion.div>

        {/* Library Limit Banner */}
        <LibraryLimitBanner 
          currentCount={libraryLimits.currentCount}
          maxLimit={libraryLimits.maxLimit}
          remaining={libraryLimits.remaining}
          isUnlimited={libraryLimits.isUnlimited}
        />

        {/* Stats Section - show skeleton while loading */}
        {isLoading ? (
          <LibraryStatsSkeleton />
        ) : items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
          >
            <StatCard 
              icon={BookOpen} 
              label={t('library.totalBooks') || "Total Books"} 
              value={stats.total}
              color="bg-primary/10 text-primary"
            />
            <StatCard 
              icon={Clock} 
              label={t('library.inProgress') || "In Progress"} 
              value={stats.reading}
              color="bg-amber-500/10 text-amber-500"
            />
            <StatCard 
              icon={BookCheck} 
              label={t('library.completed') || "Completed"} 
              value={stats.completed}
              color="bg-green-500/10 text-green-500"
            />
          </motion.div>
        )}

        {/* Search & Filters */}
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-4 mb-8"
          >
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('library.searchPlaceholder') || "Search your library..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <TabsList>
                <TabsTrigger value="all">
                  {t('library.all') || "All"}
                </TabsTrigger>
                <TabsTrigger value="reading">
                  {t('library.reading') || "Reading"}
                </TabsTrigger>
                <TabsTrigger value="completed">
                  {t('library.completed') || "Completed"}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Category Filter */}
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} className="capitalize">
                    {cat.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px]">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t('library.sortRecent') || "Newest"}</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="title">{t('library.sortTitle') || "A-Z"}</SelectItem>
                <SelectItem value="title-desc">Z-A</SelectItem>
                <SelectItem value="progress">{t('library.sortProgress') || "Progress"}</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        )}

        {/* Library Content */}
        {isLoading && items.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <BookCardSkeleton key={index} />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            {/* CONTRACT 5.5: No red error screens - use gentle messaging */}
            <div className="bg-muted/50 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <CloudOff className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3">
              Couldn't load your library
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Check your internet connection and try again. Your reading progress is safe.
            </p>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.tryAgain')}
            </Button>
          </motion.div>
        ) : loadState === 'offline-empty' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="bg-muted/50 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <CloudOff className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3">
              You're offline
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Your library will appear when you reconnect to the internet.
            </p>
          </motion.div>
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="bg-gradient-gold/10 rounded-full p-8 w-32 h-32 mx-auto mb-6 flex items-center justify-center">
              <Sparkles className="h-16 w-16 text-primary" />
            </div>
            <h2 className="font-display text-3xl font-semibold mb-3">
              {t('library.empty')}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto text-lg">
              {t('library.emptyDescription')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" size="lg" onClick={() => navigate("/explore")}>
                <Plus className="h-5 w-5 mr-2" />
                {t('library.exploreBooks')}
              </Button>
              <Button variant="gold-outline" size="lg" onClick={() => navigate("/generate")}>
                <Sparkles className="h-5 w-5 mr-2" />
                {t('library.generateBook')}
              </Button>
            </div>
          </motion.div>
        ) : filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="bg-muted/30 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <Search className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3">
              {t('library.noResults') || "No books found"}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t('library.noResultsDesc') || "Try adjusting your search or filters"}
            </p>
            <Button variant="outline" onClick={() => { setSearchQuery(""); setFilterStatus("all"); setFilterCategory("all"); setSortBy("recent"); }}>
              {t('library.clearFilters') || "Clear Filters"}
            </Button>
          </motion.div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {filteredItems.map((item, index) => (
                  <LibraryBookCard
                    key={item.id}
                    libraryId={item.id}
                    bookId={item.books.id}
                    title={item.books.title}
                    description={item.books.description}
                    category={item.books.category}
                    coverImageUrl={item.books.cover_image_url}
                    totalChapters={item.books.total_chapters}
                    progressPercent={item.progress_percent}
                    lastReadChapter={item.last_read_chapter}
                    onRemove={handleRemoveBook}
                    index={index}
                  />
                ))}
                
                {isLoadingMore && Array.from({ length: 4 }).map((_, index) => (
                  <BookCardSkeleton key={`loading-${index}`} />
                ))}
              </motion.div>
            </AnimatePresence>

            {/* Load More Button */}
            {hasMore && !isLoadingMore && filteredItems.length === items.length && (
              <div className="flex justify-center mt-10">
                <Button 
                  variant="outline" 
                  onClick={loadMore}
                  size="lg"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('library.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
