import { motion } from "framer-motion";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Sample featured books data
const SAMPLE_BOOKS = [
  {
    id: "1",
    title: "The Prophetic Voice: Understanding Divine Communication",
    description: "A comprehensive exploration of prophetic utterances throughout history and their modern relevance.",
    category: "prophecy",
    totalChapters: 12,
  },
  {
    id: "2",
    title: "Quantum Theology: Where Science Meets Spirit",
    description: "Bridging the gap between quantum physics and theological understanding of creation.",
    category: "science",
    totalChapters: 8,
  },
  {
    id: "3",
    title: "The African Renaissance: Reclaiming Heritage",
    description: "An in-depth study of Africa's contribution to world civilization and its future trajectory.",
    category: "african_studies",
    totalChapters: 15,
  },
  {
    id: "4",
    title: "Sacred Economics: Wealth and Divine Principles",
    description: "Exploring the intersection of financial wisdom and spiritual teachings.",
    category: "economics",
    totalChapters: 10,
  },
];

export function FeaturedBooks() {
  const navigate = useNavigate();

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
              <span className="text-gradient-gold">Featured</span> Books
            </h2>
            <p className="text-muted-foreground max-w-md">
              Discover our curated selection of AI-generated wisdom texts
            </p>
          </div>
          <Button 
            variant="ghost" 
            className="mt-4 md:mt-0 group text-scroll-gold hover:text-scroll-gold-light"
            onClick={() => navigate('/explore')}
          >
            View All Books
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>

        {/* Books Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SAMPLE_BOOKS.map((book, index) => (
            <BookCard
              key={book.id}
              {...book}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
