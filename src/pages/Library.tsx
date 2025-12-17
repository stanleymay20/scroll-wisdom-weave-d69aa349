import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Library as LibraryIcon, BookOpen, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  books: Book;
}

const ITEMS_PER_PAGE = 12;

// Skeleton loader component
function BookCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-card border border-border/50">
      <Skeleton className="aspect-[3/4] w-full" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function Library() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchLibrary(0, true);
    }
  }, [user]);

  const fetchLibrary = async (pageNum: number, reset = false) => {
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const from = pageNum * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from("user_library")
        .select(`
          id,
          book_id,
          progress_percent,
          last_read_chapter,
          books (
            id,
            title,
            description,
            category,
            cover_image_url,
            total_chapters
          )
        `, { count: 'exact' })
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
    } catch (error: any) {
      console.error("Error fetching library:", error);
      toast({
        title: "Error",
        description: "Failed to load your library.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchLibrary(page + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-gradient-gold p-3 rounded-xl">
              <LibraryIcon className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-gradient-gold mb-4">
            My Library
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Your personal collection of saved books and reading progress
          </p>
        </motion.div>

        {/* Library Content */}
        {isLoading ? (
          // Skeleton Loaders - Show immediately while loading
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <BookCardSkeleton key={index} />
            ))}
          </div>
        ) : libraryItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="bg-muted/30 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="font-display text-2xl font-semibold mb-3">
              Your library is empty
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start exploring our collection and save books to build your personal library.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" onClick={() => navigate("/explore")}>
                <Plus className="h-4 w-4 mr-2" />
                Explore Books
              </Button>
              <Button variant="gold-outline" onClick={() => navigate("/generate")}>
                Generate a Book
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {libraryItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                >
                  <BookCard
                    id={item.books.id}
                    title={item.books.title}
                    category={item.books.category}
                    coverImageUrl={item.books.cover_image_url ?? undefined}
                    totalChapters={item.books.total_chapters ?? 0}
                  />
                </motion.div>
              ))}
              
              {/* Loading more skeletons */}
              {isLoadingMore && Array.from({ length: 4 }).map((_, index) => (
                <BookCardSkeleton key={`loading-${index}`} />
              ))}
            </motion.div>

            {/* Load More Button */}
            {hasMore && !isLoadingMore && (
              <div className="flex justify-center mt-8">
                <Button 
                  variant="outline" 
                  onClick={loadMore}
                  size="lg"
                >
                  Load More Books
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
