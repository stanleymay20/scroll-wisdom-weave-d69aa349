import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { 
  Book, 
  BookOpen, 
  Bookmark, 
  Share2, 
  Clock, 
  User,
  ChevronRight,
  Play
} from "lucide-react";

// Sample book data
const SAMPLE_BOOK = {
  id: "1",
  title: "The Prophetic Voice: Understanding Divine Communication",
  description: "A comprehensive exploration of prophetic utterances throughout history and their modern relevance. This work delves deep into the nature of divine communication, examining how prophets across cultures and ages have served as conduits for spiritual wisdom. Through rigorous academic analysis and scroll-aligned perspective, we explore the patterns, purposes, and power of prophetic voices throughout human history.",
  category: "prophecy",
  author_ai_agent: "ScrollAuthorGPT",
  total_chapters: 12,
  cover_image_url: null,
  chapters: [
    { id: "ch1", chapter_number: 1, title: "The Nature of Prophetic Communication", word_count: 8500 },
    { id: "ch2", chapter_number: 2, title: "Historical Prophets and Their Messages", word_count: 9200 },
    { id: "ch3", chapter_number: 3, title: "The Voice Within: Internal Prophetic Experience", word_count: 8800 },
    { id: "ch4", chapter_number: 4, title: "Signs, Symbols, and Prophetic Language", word_count: 9100 },
    { id: "ch5", chapter_number: 5, title: "The Prophet's Burden: Responsibility and Calling", word_count: 8600 },
    { id: "ch6", chapter_number: 6, title: "Testing and Validating Prophetic Words", word_count: 8900 },
    { id: "ch7", chapter_number: 7, title: "Prophetic Movements Throughout History", word_count: 9500 },
    { id: "ch8", chapter_number: 8, title: "Modern Prophetic Voices", word_count: 8700 },
    { id: "ch9", chapter_number: 9, title: "The Community and the Prophet", word_count: 8400 },
    { id: "ch10", chapter_number: 10, title: "False Prophecy: Discernment and Protection", word_count: 9000 },
    { id: "ch11", chapter_number: 11, title: "Prophetic Ethics and Boundaries", word_count: 8600 },
    { id: "ch12", chapter_number: 12, title: "The Future of Prophetic Ministry", word_count: 9300 },
  ],
};

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isSaved, setIsSaved] = useState(false);
  
  const book = SAMPLE_BOOK; // In real app, fetch from database
  const totalWords = book.chapters.reduce((sum, ch) => sum + ch.word_count, 0);
  const readingTime = Math.ceil(totalWords / 200); // ~200 words per minute

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Book Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12"
          >
            {/* Cover */}
            <div className="lg:col-span-1">
              <div className="aspect-[3/4] relative rounded-xl overflow-hidden bg-gradient-to-br from-scroll-indigo to-scroll-indigo-deep border border-border/50 shadow-card">
                {book.cover_image_url ? (
                  <img
                    src={book.cover_image_url}
                    alt={book.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Book className="h-24 w-24 text-scroll-gold/30" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="lg:col-span-2">
              <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-scroll-gold/20 text-scroll-gold border border-scroll-gold/30 mb-4 capitalize">
                {book.category.replace(/_/g, " ")}
              </span>
              
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                {book.title}
              </h1>
              
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                {book.description}
              </p>

              {/* Meta */}
              <div className="flex flex-wrap gap-6 mb-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-scroll-gold" />
                  <span>{book.author_ai_agent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-scroll-gold" />
                  <span>{book.total_chapters} Chapters</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-scroll-gold" />
                  <span>{readingTime} min read</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-4">
                <Button 
                  variant="hero" 
                  size="lg"
                  onClick={() => navigate(`/read/${id}/1`)}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Start Reading
                </Button>
                <Button 
                  variant="gold-outline" 
                  size="lg"
                  onClick={() => setIsSaved(!isSaved)}
                >
                  <Bookmark className={`h-5 w-5 mr-2 ${isSaved ? "fill-current" : ""}`} />
                  {isSaved ? "Saved" : "Save to Library"}
                </Button>
                <Button variant="muted" size="lg">
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Chapters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="font-display text-2xl font-bold mb-6">
              Table of Contents
            </h2>
            <div className="space-y-3">
              {book.chapters.map((chapter, index) => (
                <motion.div
                  key={chapter.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                >
                  <button
                    onClick={() => navigate(`/read/${id}/${chapter.chapter_number}`)}
                    className="w-full group"
                  >
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-card border border-border/50 hover:border-scroll-gold/50 transition-all duration-300 hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <span className="w-10 h-10 rounded-lg bg-scroll-gold/10 flex items-center justify-center font-display font-bold text-scroll-gold">
                          {chapter.chapter_number}
                        </span>
                        <div className="text-left">
                          <h3 className="font-medium text-foreground group-hover:text-scroll-gold transition-colors">
                            {chapter.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {chapter.word_count.toLocaleString()} words
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-scroll-gold group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
