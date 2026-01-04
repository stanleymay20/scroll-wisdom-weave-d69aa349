import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/mobile";
import { LibraryBookCard } from "@/components/books/LibraryBookCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Library as LibraryIcon, 
  BookOpen, 
  Plus, 
  RefreshCw, 
  AlertCircle,
  Search,
  SlidersHorizontal,
  BookCheck,
  Clock,
  Sparkles,
  AlertTriangle
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

interface Book {
  id: string;
  title: string;
  description: string | null;
  category: string;
  cover_image_url: string | null;
  total_chapters: number | null;
}

interface LibraryItem {
  id: string;
  book_id: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  created_at: string;
  books: Book;
}

const ITEMS_PER_PAGE = 12;

// Skeleton loader component
function BookCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border/50">
      <Skeleton className="aspect-[3/4] w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

// Stats card component
function StatCard({ icon: Icon, label, value, color }: { 
  icon: typeof BookOpen; 
  label: string; 
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
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

// Mobile Library Content Component
function MobileLibraryContent({
  libraryItems,
  filteredItems,
  isLoading,
  loadError,
  stats,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  sortBy,
  setSortBy,
  handleRetry,
  handleRemoveBook,
  hasMore,
  isLoadingMore,
  loadMore,
  libraryLimits
}: {
  libraryItems: LibraryItem[];
  filteredItems: LibraryItem[];
  isLoading: boolean;
  loadError: string | null;
  stats: { total: number; reading: number; completed: number };
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterStatus: "all" | "reading" | "completed";
  setFilterStatus: (v: "all" | "reading" | "completed") => void;
  sortBy: "recent" | "title" | "progress";
  setSortBy: (v: "recent" | "title" | "progress") => void;
  handleRetry: () => void;
  handleRemoveBook: (id: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  libraryLimits: ReturnType<typeof useLibraryLimits>;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="px-4 py-4">
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
      {!isLoading && libraryItems.length > 0 && (
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
      {!isLoading && libraryItems.length > 0 && (
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
      {!isLoading && libraryItems.length > 0 && (
        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="mb-6">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="reading" className="flex-1">Reading</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">Done</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      ) : libraryItems.length === 0 ? (
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
          <Button variant="outline" onClick={() => { setSearchQuery(""); setFilterStatus("all"); }}>
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
          
          {hasMore && !isLoadingMore && filteredItems.length === libraryItems.length && (
            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={loadMore}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load More
              </Button>
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
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "reading" | "completed">("all");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "progress">("recent");
  const navigate = useNavigate();
  const { toast } = useToast();
  const libraryLimits = useLibraryLimits();

  // Calculate stats
  const stats = {
    total: libraryItems.length,
    reading: libraryItems.filter(i => (i.progress_percent || 0) > 0 && (i.progress_percent || 0) < 100).length,
    completed: libraryItems.filter(i => (i.progress_percent || 0) >= 100).length,
  };

  useEffect(() => {
    let mounted = true;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchLibrary(0, true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Filter and sort items
  useEffect(() => {
    let result = [...libraryItems];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.books.title.toLowerCase().includes(query) ||
        item.books.category.toLowerCase().includes(query) ||
        item.books.description?.toLowerCase().includes(query)
      );
    }

    // Status filter
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
        case "progress":
          return (b.progress_percent || 0) - (a.progress_percent || 0);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredItems(result);
  }, [libraryItems, searchQuery, filterStatus, sortBy]);

  const fetchLibrary = async (pageNum: number, reset = false, retry = 0) => {
    if (reset) {
      setIsLoading(true);
      setLoadError(null);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Optimized query - only select needed fields for cards
      const { data, error } = await supabase
        .from("user_library")
        .select(`
          id,
          book_id,
          progress_percent,
          last_read_chapter,
          created_at,
          books!inner (
            id,
            title,
            description,
            category,
            cover_image_url,
            total_chapters
          )
        `)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      const newItems = (data as any) || [];
      
      if (reset) {
        setLibraryItems(newItems);
      } else {
        setLibraryItems(prev => [...prev, ...newItems]);
      }
      
      setHasMore(newItems.length === ITEMS_PER_PAGE);
      setPage(pageNum);
      setLoadError(null);
      setRetryCount(0);
    } catch (error: any) {
      console.error("Error fetching library:", error);
      
      if (retry < 2) {
        const delay = Math.pow(2, retry) * 500;
        setTimeout(() => {
          fetchLibrary(pageNum, reset, retry + 1);
        }, delay);
        return;
      }
      
      setLoadError(t('library.loadError'));
      if (!reset) {
        toast({
          title: t('common.error'),
          description: t('library.loadMoreError'),
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchLibrary(0, true);
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchLibrary(page + 1);
    }
  };

  const handleRemoveBook = useCallback((libraryId: string) => {
    setLibraryItems(prev => prev.filter(item => item.id !== libraryId));
    // Refresh library limits after removal
    libraryLimits.refresh();
  }, [libraryLimits]);

  // Mobile layout with persistent shell
  if (isMobile) {
    return (
      <MobileLayout showGenerateButton={false}>
        <MobileLibraryContent
          libraryItems={libraryItems}
          filteredItems={filteredItems}
          isLoading={isLoading}
          loadError={loadError}
          stats={stats}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          sortBy={sortBy}
          setSortBy={setSortBy}
          handleRetry={handleRetry}
          handleRemoveBook={handleRemoveBook}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMore={loadMore}
          libraryLimits={libraryLimits}
        />
      </MobileLayout>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-24">
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

        {/* Stats Section */}
        {!isLoading && libraryItems.length > 0 && (
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
        {!isLoading && libraryItems.length > 0 && (
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

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t('library.sortRecent') || "Most Recent"}</SelectItem>
                <SelectItem value="title">{t('library.sortTitle') || "Title"}</SelectItem>
                <SelectItem value="progress">{t('library.sortProgress') || "Progress"}</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        )}

        {/* Library Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <BookCardSkeleton key={index} />
            ))}
          </div>
        ) : loadError ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="bg-destructive/10 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3">
              {t('library.failedToLoad')}
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {loadError}
            </p>
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.tryAgain')}
            </Button>
          </motion.div>
        ) : libraryItems.length === 0 ? (
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
            <Button variant="outline" onClick={() => { setSearchQuery(""); setFilterStatus("all"); }}>
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
            {hasMore && !isLoadingMore && filteredItems.length === libraryItems.length && (
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
