/**
 * Continue Reading Widget
 * Shows user's most recently read book with quick-access resume
 */

import { useEffect, useState, memo } from "react";
import { stripMarkdownInline } from "@/lib/stripMarkdownInline";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface RecentBook {
  bookId: string;
  title: string;
  coverImageUrl: string | null;
  progressPercent: number;
  lastReadChapter: number | null;
  category: string;
}

export const ContinueReadingWidget = memo(function ContinueReadingWidget() {
  const [recentBook, setRecentBook] = useState<RecentBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecentBook = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);

        const { data } = await supabase
          .from("user_library")
          .select(`
            book_id,
            progress_percent,
            last_read_chapter,
            created_at,
            books!inner (
              id,
              title,
              cover_image_url,
              category
            )
          `)
          .eq("user_id", user.id)
          .gt("progress_percent", 0)
          .lt("progress_percent", 100)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.books) {
          const book = data.books as { id: string; title: string; cover_image_url: string | null; category: string };
          setRecentBook({
            bookId: book.id,
            title: book.title,
            coverImageUrl: book.cover_image_url,
            progressPercent: data.progress_percent || 0,
            lastReadChapter: data.last_read_chapter,
            category: book.category,
          });
        }
      } catch (error) {
        console.error("Error fetching recent book:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentBook();
  }, []);

  // Don't render if no user or no recent book
  if (!loading && (!userId || !recentBook)) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-scroll-gold/10 to-scroll-bronze/10 border border-scroll-gold/20 rounded-2xl p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="w-16 h-24 md:w-20 md:h-28 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-2 w-full mt-2" />
          </div>
        </div>
      </div>
    );
  }

  const chapterToRead = (recentBook.lastReadChapter || 0) + 1;

  return (
    <div className="bg-gradient-to-r from-scroll-gold/10 to-scroll-bronze/10 border border-scroll-gold/20 rounded-2xl p-4 md:p-6 transition-all hover:border-scroll-gold/40">
      <div className="flex items-center gap-2 mb-4 text-scroll-gold">
        <Clock className="h-4 w-4 md:h-5 md:w-5" />
        <span className="text-sm md:text-base font-medium">Continue Reading</span>
      </div>

      <Link
        to={`/read/${recentBook.bookId}/${chapterToRead}`}
        className="flex gap-4 group"
      >
        {/* Book Cover */}
        <div className="w-16 h-24 md:w-20 md:h-28 rounded-lg overflow-hidden flex-shrink-0 bg-muted border border-border/50 shadow-md">
          {recentBook.coverImageUrl ? (
            <img
              src={recentBook.coverImageUrl}
              alt={recentBook.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-scroll-gold/20 to-scroll-bronze/20">
              <BookOpen className="h-6 w-6 text-scroll-gold/50" />
            </div>
          )}
        </div>

        {/* Book Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          <div>
            <h3 className="font-semibold text-foreground truncate group-hover:text-scroll-gold transition-colors text-sm md:text-base">
              {recentBook.title}
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground capitalize mt-0.5">
              {recentBook.category.replace(/_/g, ' ')}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Chapter {chapterToRead}</span>
              <span>{Math.round(recentBook.progressPercent)}% complete</span>
            </div>
            <Progress value={recentBook.progressPercent} className="h-1.5" />
          </div>
        </div>

        {/* Resume Button */}
        <div className="flex items-center self-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-scroll-gold/10 hover:bg-scroll-gold/20 text-scroll-gold"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </Link>
    </div>
  );
});
