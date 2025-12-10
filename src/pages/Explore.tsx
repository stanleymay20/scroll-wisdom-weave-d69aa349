import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = [
  "all",
  "theology",
  "prophecy",
  "science",
  "technology",
  "business",
  "finance",
  "economics",
  "medicine",
  "law",
  "governance",
  "history",
  "african_studies",
  "culture",
  "philosophy",
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
}

// Sample books for demo (since we don't have real data yet)
const SAMPLE_BOOKS: Book[] = [
  {
    id: "1",
    title: "The Prophetic Voice: Understanding Divine Communication",
    description: "A comprehensive exploration of prophetic utterances throughout history.",
    category: "prophecy",
    cover_image_url: null,
    total_chapters: 12,
  },
  {
    id: "2",
    title: "Quantum Theology: Where Science Meets Spirit",
    description: "Bridging the gap between quantum physics and theological understanding.",
    category: "science",
    cover_image_url: null,
    total_chapters: 8,
  },
  {
    id: "3",
    title: "The African Renaissance: Reclaiming Heritage",
    description: "An in-depth study of Africa's contribution to world civilization.",
    category: "african_studies",
    cover_image_url: null,
    total_chapters: 15,
  },
  {
    id: "4",
    title: "Sacred Economics: Wealth and Divine Principles",
    description: "Exploring the intersection of financial wisdom and spiritual teachings.",
    category: "economics",
    cover_image_url: null,
    total_chapters: 10,
  },
  {
    id: "5",
    title: "The Art of Governance: Principles from Ancient Scrolls",
    description: "Leadership wisdom drawn from historical and prophetic sources.",
    category: "governance",
    cover_image_url: null,
    total_chapters: 9,
  },
  {
    id: "6",
    title: "Healing Through Faith: Medicine and Spirit",
    description: "The intersection of modern medicine and spiritual healing practices.",
    category: "medicine",
    cover_image_url: null,
    total_chapters: 11,
  },
];

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || "all"
  );
  const [books, setBooks] = useState<Book[]>(SAMPLE_BOOKS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      setSelectedCategory(category);
    }
  }, [searchParams]);

  const filteredBooks = books.filter((book) => {
    const matchesCategory = selectedCategory === "all" || book.category === selectedCategory;
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (category === "all") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", category);
    }
    setSearchParams(searchParams);
  };

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
              Explore the <span className="text-gradient-gold">Library</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Browse through our collection of AI-generated books spanning theology, 
              science, history, and beyond.
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
                  placeholder="Search books..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-muted/50 border-border/50 focus:border-scroll-gold"
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
                  {category.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </motion.div>

          {/* Books Grid */}
          {filteredBooks.length > 0 ? (
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
                No books found. Try adjusting your search or filters.
              </p>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
