import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MobileBookCard } from "./MobileBookCard";
import { Skeleton } from "@/components/ui/skeleton";

interface Book {
  id: string;
  title: string;
  cover_image_url: string | null;
  category: string;
  book_type: string;
  created_at: string | null;
}

interface LibraryItem {
  book_id: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  books: Book;
}

function BookGridSkeleton({ count = 4 }: { count?: number }) {
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
}

function SectionHeader({ title, linkTo }: { title: string; linkTo: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
      <Link 
        to={linkTo} 
        className="flex items-center gap-1 text-sm text-scroll-gold hover:text-scroll-gold-light"
      >
        See all
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function MobileHome() {
  const [continueReading, setContinueReading] = useState<LibraryItem[]>([]);
  const [lastAdded, setLastAdded] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser();
        setUserId(user?.id || null);

        // Fetch continue reading (user's library with progress)
        if (user) {
          const { data: libraryData } = await supabase
            .from("user_library")
            .select(`
              book_id,
              progress_percent,
              last_read_chapter,
              books (
                id,
                title,
                cover_image_url,
                category,
                book_type,
                created_at
              )
            `)
            .eq("user_id", user.id)
            .gt("progress_percent", 0)
            .lt("progress_percent", 100)
            .order("created_at", { ascending: false })
            .limit(4);

          if (libraryData) {
            setContinueReading(libraryData as unknown as LibraryItem[]);
          }
        }

        // Fetch last added books (public, published)
        const { data: booksData } = await supabase
          .from("books")
          .select("id, title, cover_image_url, category, book_type, created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(6);

        if (booksData) {
          setLastAdded(booksData);
        }
      } catch (error) {
        console.error("Error fetching mobile home data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate header height (56px) + safe area
  return (
    <div 
      className="min-h-screen bg-background pb-24 px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px + 16px)" }}
    >
      {/* Continue Reading Section */}
      {userId && continueReading.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Continue Reading" linkTo="/library" />
          <div className="grid grid-cols-2 gap-4">
            {continueReading.map((item) => (
              <MobileBookCard
                key={item.book_id}
                id={item.books.id}
                title={item.books.title}
                coverImageUrl={item.books.cover_image_url || undefined}
                category={item.books.category}
                bookType={item.books.book_type}
              />
            ))}
          </div>
        </section>
      )}

      {/* Last Added Section */}
      <section className="mb-8">
        <SectionHeader title="Last Added" linkTo="/explore" />
        {loading ? (
          <BookGridSkeleton count={6} />
        ) : lastAdded.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
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
          <div className="text-center py-12">
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
          {["Theology", "Science", "History", "Fiction", "Philosophy", "Arts"].map((cat) => (
            <Link
              key={cat}
              to={`/explore?category=${cat.toLowerCase()}`}
              className="flex-shrink-0 px-4 py-2 rounded-full bg-muted text-sm font-medium text-foreground hover:bg-scroll-gold/10 hover:text-scroll-gold transition-colors"
            >
              {cat}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
