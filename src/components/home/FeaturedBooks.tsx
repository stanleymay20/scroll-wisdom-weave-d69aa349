/**
 * CONTRACT 5 — Featured Books Section
 * 
 * Uses cache-first strategy for real books.
 * Falls back to sample data for instant display.
 * Never blocks first paint.
 */

import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { apiCache, cacheKeys } from "@/lib/cache";
import { FeaturedBooksSkeleton } from "@/components/ui/page-skeletons";

interface FeaturedBook {
  id: string;
  title: string;
  description: string | null;
  category: string;
  cover_image_url: string | null;
  total_chapters: number | null;
}

// No more hardcoded sample books — show skeleton until real data loads

export const FeaturedBooks = memo(function FeaturedBooks() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [books, setBooks] = useState<FeaturedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  // CONTRACT 5: Cache-first background fetch
  useEffect(() => {
    const fetchFeaturedBooks = async () => {
      // Try cache first
      const cached = apiCache.get<FeaturedBook[]>(cacheKeys.featuredBooks());
      if (cached && cached.length > 0) {
        setBooks(cached);
        setHasRealData(true);
      }

      // Fetch fresh data in background
      try {
        const { data, error } = await supabase
          .from("books")
          .select("id, title, description, category, cover_image_url, total_chapters")
          .eq("is_published", true)
          .eq("is_featured", true)
          .order("created_at", { ascending: false })
          .limit(4);

        if (!error && data && data.length > 0) {
          setBooks(data);
          setHasRealData(true);
          apiCache.set(cacheKeys.featuredBooks(), data, 5 * 60 * 1000); // 5 min cache
        } else if (!cached || cached.length === 0) {
          // No featured books, try recent books
          const { data: recentData } = await supabase
            .from("books")
            .select("id, title, description, category, cover_image_url, total_chapters")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(4);

          if (recentData && recentData.length > 0) {
            setBooks(recentData);
            setHasRealData(true);
            apiCache.set(cacheKeys.featuredBooks(), recentData, 5 * 60 * 1000);
          }
        }
      } catch (error) {
        console.error("Error fetching featured books:", error);
        // Keep sample data on error
      }
    };

    // Defer fetch to not block first paint
    const timeoutId = setTimeout(fetchFeaturedBooks, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-end justify-between mb-12"
        >
          <div>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
              <span className="text-gradient-gold">{t('featured.title')}</span> {t('home.stats.books')}
            </h2>
            <p className="text-muted-foreground max-w-md">
              {t('featured.subtitle')}
            </p>
          </div>
          <Button 
            variant="ghost" 
            className="mt-4 md:mt-0 group text-primary hover:text-primary/80"
            onClick={() => navigate('/explore')}
          >
            {t('featured.viewAll')}
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>

        {/* Books Grid - renders immediately with sample or cached data */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {books.map((book, index) => (
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
      </div>
    </section>
  );
});