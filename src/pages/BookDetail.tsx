import { useState, useEffect } from "react";
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
  Play,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BookData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  author_ai_agent: string | null;
  total_chapters: number | null;
  cover_image_url: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
}

export default function BookDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [book, setBook] = useState<BookData | null>(null);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      // Fetch book
      const { data: bookData, error: bookError } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .single();

      if (bookError) {
        console.error("Error fetching book:", bookError);
        toast({
          title: "Error",
          description: "Book not found",
          variant: "destructive",
        });
        navigate("/explore");
        return;
      }

      setBook(bookData);

      // Fetch chapters
      const { data: chaptersData, error: chaptersError } = await supabase
        .from("chapters")
        .select("id, chapter_number, title, word_count")
        .eq("book_id", id)
        .order("chapter_number");

      if (!chaptersError && chaptersData) {
        setChapters(chaptersData);
      }

      // Check if book is in user's library
      if (currentUser) {
        const { data: libraryItem } = await supabase
          .from("user_library")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("book_id", id)
          .single();

        setIsSaved(!!libraryItem);
      }

      setIsLoading(false);
    };

    if (id) {
      fetchData();
    }
  }, [id, navigate, toast]);

  const handleSaveToLibrary = async () => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save books to your library",
      });
      navigate("/auth");
      return;
    }

    if (isSaved) {
      // Remove from library
      const { error } = await supabase
        .from("user_library")
        .delete()
        .eq("user_id", user.id)
        .eq("book_id", id);

      if (!error) {
        setIsSaved(false);
        toast({ title: "Removed from library" });
      }
    } else {
      // Add to library
      const { error } = await supabase
        .from("user_library")
        .insert({
          user_id: user.id,
          book_id: id,
          progress_percent: 0,
          last_read_chapter: 1,
        });

      if (!error) {
        setIsSaved(true);
        toast({ title: "Added to library" });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-24 pb-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-scroll-gold" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!book) {
    return null;
  }

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const readingTime = Math.ceil(totalWords / 200) || 1;

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
                {book.description || "A comprehensive exploration of this topic."}
              </p>

              {/* Meta */}
              <div className="flex flex-wrap gap-6 mb-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-scroll-gold" />
                  <span>{book.author_ai_agent || "ScrollAuthorGPT"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-scroll-gold" />
                  <span>{chapters.length || book.total_chapters} Chapters</span>
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
                  disabled={chapters.length === 0}
                >
                  <Play className="h-5 w-5 mr-2" />
                  Start Reading
                </Button>
                <Button 
                  variant="gold-outline" 
                  size="lg"
                  onClick={handleSaveToLibrary}
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
            {chapters.length === 0 ? (
              <p className="text-muted-foreground">Chapters are being generated...</p>
            ) : (
              <div className="space-y-3">
                {chapters.map((chapter, index) => (
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
                              {(chapter.word_count || 0).toLocaleString()} words
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-scroll-gold group-hover:translate-x-1 transition-all" />
                      </div>
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
