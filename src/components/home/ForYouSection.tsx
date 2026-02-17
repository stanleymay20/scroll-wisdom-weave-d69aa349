import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Categories that match what's actually in the database
const CATEGORIES = [
  "All",
  "Technology",
  "Science",
  "Business",
  "Finance",
  "Psychology",
  "Health",
  "Non Fiction",
  "History",
  "Governance",
];

// Map display labels to potential DB values (handles both "Non Fiction" and "non_fiction")
function categoryFilter(cat: string): string[] {
  if (cat === "All") return [];
  const lower = cat.toLowerCase().replace(/\s+/g, '_');
  // Return both forms to handle inconsistent data
  return [cat, lower, cat.toLowerCase()];
}

interface Book {
  id: string;
  title: string;
  category: string;
  cover_image_url: string | null;
  description: string | null;
  created_at: string;
}

export function ForYouSection() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBooks();
  }, [selectedCategory]);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("books")
        .select("id, title, category, cover_image_url, description, created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(8);

      if (selectedCategory !== "All") {
        const variants = categoryFilter(selectedCategory);
        // Use .in() to match any variant of the category name
        query = query.in("category", variants);
      }

      const { data } = await query;
      setBooks(data || []);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  // Format category for display
  const formatCategory = (cat: string) => {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <section className="py-16 bg-muted/30" aria-labelledby="for-you-heading">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 id="for-you-heading" className="text-2xl font-display font-bold text-foreground">
              For You
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Recently published books from the library
            </p>
          </div>
          <Link
            to="/explore"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            See all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Book grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No published books found in this category yet.</p>
            <p className="text-xs mt-1">Books appear here once they are generated and published.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list">
            {books.map((book, i) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                role="listitem"
              >
                <Link
                  to={`/book/${book.id}`}
                  className="group block bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {book.cover_image_url ? (
                      <img
                        src={book.cover_image_url}
                        alt={`Cover of ${book.title}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                      {book.title}
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {formatCategory(book.category)}
                    </Badge>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
