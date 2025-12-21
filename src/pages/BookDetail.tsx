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
  Clock, 
  User,
  ChevronRight,
  Play,
  Loader2,
  Sparkles,
  CheckCircle2,
  Flag,
  Globe,
  Lock,
  RefreshCw,
  Palette
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ShareDialog } from "@/components/books/ShareDialog";
import { ExportDialog } from "@/components/books/ExportDialog";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";

interface BookData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  author_ai_agent: string | null;
  total_chapters: number | null;
  cover_image_url: string | null;
  is_published: boolean | null;
  creator_id: string | null;
  language: string | null;
  book_type: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
  is_generated: boolean | null;
  content: string | null;
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
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isUpdatingPublish, setIsUpdatingPublish] = useState(false);
  const [coverTheme, setCoverTheme] = useState("classic");
  const isOwner = user && book?.creator_id === user.id;

  const coverThemes = [
    { value: "classic", label: "Classic", description: "Dark indigo with gold accents" },
    { value: "modern", label: "Modern", description: "Bold geometric gradients" },
    { value: "vintage", label: "Vintage", description: "Aged paper & ornate borders" },
    { value: "nature", label: "Nature", description: "Earthy tones & organic elements" },
    { value: "cosmic", label: "Cosmic", description: "Deep space & nebulae" },
    { value: "minimalist", label: "Minimalist", description: "Ultra-clean simplicity" },
    { value: "african", label: "African Heritage", description: "Rich patterns & warm tones" },
    { value: "prophetic", label: "Prophetic", description: "Divine light & sacred aesthetic" },
  ];

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
        .select("id, chapter_number, title, word_count, is_generated, content")
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

    // Set up realtime subscription for chapter updates
    const channel = supabase
      .channel('chapter-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chapters',
          filter: `book_id=eq.${id}`
        },
        (payload) => {
          const updatedChapter = payload.new as ChapterData;
          setChapters(prev => prev.map(ch => 
            ch.id === updatedChapter.id ? { ...ch, ...updatedChapter } : ch
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

  const handleGenerateChapter = async (chapter: ChapterData, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!book) return;
    
    setGeneratingChapterId(chapter.id);
    
    try {
      // Extract key topics from existing content if available
      const keyTopicsMatch = chapter.content?.match(/### Key Topics\n([\s\S]*?)(?:\n\n|\*Full chapter)/);
      const keyTopics = keyTopicsMatch 
        ? keyTopicsMatch[1].split('\n').filter(t => t.startsWith('-')).map(t => t.replace('- ', ''))
        : [];

      const response = await supabase.functions.invoke('generate-chapter', {
        body: {
          chapterId: chapter.id,
          bookTitle: book.title,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapter_number,
          keyTopics,
          category: book.category,
          language: book.language || 'en',
          bookType: book.book_type || 'text', // Pass book type for comic/illustrated generation
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      // Update chapter in local state
      setChapters(prev => prev.map(ch => 
        ch.id === chapter.id 
          ? { ...ch, is_generated: true, word_count: response.data.wordCount }
          : ch
      ));

      toast({
        title: "Chapter generated",
        description: `${chapter.title} is now ready to read!`,
      });
    } catch (error) {
      console.error("Error generating chapter:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate chapter",
        variant: "destructive",
      });
    } finally {
      setGeneratingChapterId(null);
    }
  };

  const handleGenerateAllChapters = async () => {
    if (!book) return;
    
    const ungeneratedChapters = chapters.filter(ch => !ch.is_generated);
    if (ungeneratedChapters.length === 0) {
      toast({ title: "All chapters already generated" });
      return;
    }

    setIsGeneratingAll(true);
    setGenerationProgress({ current: 0, total: ungeneratedChapters.length });

    for (let i = 0; i < ungeneratedChapters.length; i++) {
      const chapter = ungeneratedChapters[i];
      setGeneratingChapterId(chapter.id);
      setGenerationProgress({ current: i + 1, total: ungeneratedChapters.length });

      try {
        const keyTopicsMatch = chapter.content?.match(/### Key Topics\n([\s\S]*?)(?:\n\n|\*Full chapter)/);
        const keyTopics = keyTopicsMatch 
          ? keyTopicsMatch[1].split('\n').filter(t => t.startsWith('-')).map(t => t.replace('- ', ''))
          : [];

        const response = await supabase.functions.invoke('generate-chapter', {
          body: {
            chapterId: chapter.id,
            bookTitle: book.title,
            chapterTitle: chapter.title,
            chapterNumber: chapter.chapter_number,
            keyTopics,
            category: book.category,
            language: book.language || 'en',
            bookType: book.book_type || 'text', // Pass book type for comic/illustrated generation
          }
        });

        if (response.error || response.data?.error) {
          throw new Error(response.error?.message || response.data?.error);
        }

        // Update local state (realtime will also update it)
        setChapters(prev => prev.map(ch => 
          ch.id === chapter.id 
            ? { ...ch, is_generated: true, word_count: response.data.wordCount }
            : ch
        ));
      } catch (error) {
        console.error(`Error generating chapter ${chapter.chapter_number}:`, error);
        toast({
          title: `Failed to generate Chapter ${chapter.chapter_number}`,
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
        // Continue with next chapter instead of stopping
      }
    }

    setIsGeneratingAll(false);
    setGeneratingChapterId(null);
    setGenerationProgress({ current: 0, total: 0 });
    
    toast({
      title: "Book generation complete",
      description: "All chapters have been generated!",
    });
  };

  const handleGenerateCover = async (theme?: string) => {
    if (!book) return;
    
    setIsGeneratingCover(true);
    
    try {
      const response = await supabase.functions.invoke('generate-cover', {
        body: {
          bookId: book.id,
          title: book.title,
          category: book.category,
          description: book.description,
          theme: theme || coverTheme,
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      // Update local state with new cover
      setBook(prev => prev ? { ...prev, cover_image_url: response.data.coverUrl } : null);

      toast({
        title: "Cover generated!",
        description: `Your book now has a ${response.data.theme || coverTheme} style cover.`,
      });
    } catch (error) {
      console.error("Error generating cover:", error);
      toast({
        title: "Cover generation failed",
        description: error instanceof Error ? error.message : "Failed to generate cover",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!book || !isOwner) return;
    
    setIsUpdatingPublish(true);
    try {
      const newPublishState = !book.is_published;
      const { error } = await supabase
        .from("books")
        .update({ is_published: newPublishState })
        .eq("id", book.id);

      if (error) throw error;

      setBook(prev => prev ? { ...prev, is_published: newPublishState } : null);
      
      toast({
        title: newPublishState ? "Book published!" : "Book unpublished",
        description: newPublishState 
          ? "Your book is now visible in the public library." 
          : "Your book is now private and only visible to you.",
      });
    } catch (error) {
      console.error("Error updating publish status:", error);
      toast({
        title: "Failed to update",
        description: "Could not change publish status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPublish(false);
    }
  };

  const handleUpdateBookType = async (nextType: "text" | "illustrated" | "comic") => {
    if (!book || !isOwner) return;

    const prevType = (book.book_type as any) || "text";
    setBook(prev => (prev ? { ...prev, book_type: nextType } : prev));

    const { error } = await supabase
      .from("books")
      .update({ book_type: nextType })
      .eq("id", book.id);

    if (error) {
      console.error("Error updating book type:", error);
      setBook(prev => (prev ? { ...prev, book_type: prevType } : prev));
      toast({
        title: "Failed to update book type",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Book type updated",
      description: "Regenerate a chapter to apply the new style.",
    });
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
              <div className="aspect-[3/4] relative rounded-xl overflow-hidden bg-gradient-to-br from-scroll-indigo to-scroll-indigo-deep border border-border/50 shadow-card group">
                {book.cover_image_url ? (
                  <img
                    src={book.cover_image_url}
                    alt={`${book.title} book cover`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
                    <Book className="h-24 w-24 text-scroll-gold/30" />
                    <p className="text-sm text-muted-foreground text-center">No cover yet</p>
                  </div>
                )}

                {isOwner && (
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-background/70 backdrop-blur-sm border-t border-border/50">
                    <div className="flex flex-col gap-2">
                      <Select value={coverTheme} onValueChange={setCoverTheme}>
                        <SelectTrigger className="w-full">
                          <Palette className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Select cover theme" />
                        </SelectTrigger>
                        <SelectContent>
                          {coverThemes.map((theme) => (
                            <SelectItem key={theme.value} value={theme.value}>
                              <div className="flex flex-col">
                                <span>{theme.label}</span>
                                <span className="text-xs text-muted-foreground">{theme.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="gold-outline"
                        size="sm"
                        onClick={() => handleGenerateCover()}
                        disabled={isGeneratingCover}
                      >
                        {isGeneratingCover ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {book.cover_image_url ? "Regenerate Cover" : "Generate Cover"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-scroll-gold/20 text-scroll-gold border border-scroll-gold/30 capitalize">
                  {book.category.replace(/_/g, " ")}
                </span>
                
                {/* Visibility Badge */}
                {isOwner && (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border ${
                    book.is_published 
                      ? "bg-green-500/10 text-green-500 border-green-500/30" 
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}>
                    {book.is_published ? (
                      <>
                        <Globe className="h-3.5 w-3.5" />
                        Public
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        Private
                      </>
                    )}
                  </span>
                )}
              </div>
              
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
                  disabled={chapters.length === 0 || !chapters.some(ch => ch.is_generated)}
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
                <ExportDialog 
                  bookId={book.id} 
                  title={book.title} 
                  hasGeneratedChapters={chapters.some(ch => ch.is_generated)}
                  coverImageUrl={book.cover_image_url}
                  authorName={book.author_ai_agent || undefined}
                />
                <ShareDialog 
                  title={book.title} 
                  bookId={book.id} 
                  description={book.description || undefined} 
                />
                <ReportContentDialog 
                  contentType="book" 
                  contentId={book.id} 
                  contentTitle={book.title}
                />
              </div>

              {/* Publish Toggle for Owners */}
              {isOwner && (
                <>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 mt-6">
                    <div className="flex-1">
                      <Label htmlFor="publish-toggle" className="text-foreground font-medium">
                        Publish to Library
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {book.is_published 
                          ? "Your book is visible to everyone in the public Explore page." 
                          : "Your book is private. Only you can see it."}
                      </p>
                    </div>
                    <Switch
                      id="publish-toggle"
                      checked={book.is_published ?? false}
                      onCheckedChange={handleTogglePublish}
                      disabled={isUpdatingPublish}
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-muted/30 border border-border/50 mt-4">
                    <Label className="text-foreground font-medium">Book type</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose how chapters are generated. Regenerate a chapter to apply.
                    </p>

                    <RadioGroup
                      value={(book.book_type || "text") as any}
                      onValueChange={(v) => handleUpdateBookType(v as any)}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4"
                    >
                      <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors">
                        <RadioGroupItem value="text" id="bt-text" />
                        <Label htmlFor="bt-text" className="cursor-pointer flex-1">
                          <span className="text-sm font-medium">Text</span>
                          <span className="block text-xs text-muted-foreground">No images</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors">
                        <RadioGroupItem value="illustrated" id="bt-illustrated" />
                        <Label htmlFor="bt-illustrated" className="cursor-pointer flex-1">
                          <span className="text-sm font-medium">Illustrated</span>
                          <span className="block text-xs text-muted-foreground">Text + illustrations</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors">
                        <RadioGroupItem value="comic" id="bt-comic" />
                        <Label htmlFor="bt-comic" className="cursor-pointer flex-1">
                          <span className="text-sm font-medium">Comic</span>
                          <span className="block text-xs text-muted-foreground">Panels + captions</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}

              {/* AI Disclaimer */}
              <ContentDisclaimer type="ai" className="mt-6" />
            </div>
          </motion.div>

          {/* Chapters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold">
                Table of Contents
              </h2>
              
              {/* Generate All Button */}
              {chapters.some(ch => !ch.is_generated) && (
                <Button
                  variant="hero"
                  onClick={handleGenerateAllChapters}
                  disabled={isGeneratingAll || generatingChapterId !== null}
                >
                  {isGeneratingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating {generationProgress.current}/{generationProgress.total}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate All Chapters
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Generation Progress Bar */}
            {isGeneratingAll && (
              <div className="mb-6 p-4 rounded-xl bg-gradient-card border border-scroll-gold/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-scroll-gold">
                    Generating chapters...
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {generationProgress.current} of {generationProgress.total} complete
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-scroll-gold to-scroll-gold-light"
                    initial={{ width: 0 }}
                    animate={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Each chapter generates 8,000-12,000 words of comprehensive content. This may take a few minutes per chapter.
                </p>
              </div>
            )}

            {chapters.length === 0 ? (
              <p className="text-muted-foreground">Chapters are being generated...</p>
            ) : (
              <div className="space-y-3">
                {chapters.map((chapter, index) => {
                  const isGenerating = generatingChapterId === chapter.id;
                  const isGenerated = chapter.is_generated;
                  
                  return (
                    <motion.div
                      key={chapter.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + index * 0.05 }}
                    >
                      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-card border border-border/50 hover:border-scroll-gold/50 transition-all duration-300 hover:shadow-lg">
                        <button
                          onClick={() => isGenerated && navigate(`/read/${id}/${chapter.chapter_number}`)}
                          className={`flex items-center gap-4 flex-1 text-left ${!isGenerated ? 'cursor-default' : 'group cursor-pointer'}`}
                          disabled={!isGenerated}
                        >
                          <span className="w-10 h-10 rounded-lg bg-scroll-gold/10 flex items-center justify-center font-display font-bold text-scroll-gold">
                            {chapter.chapter_number}
                          </span>
                          <div>
                            <h3 className={`font-medium text-foreground ${isGenerated ? 'group-hover:text-scroll-gold' : ''} transition-colors`}>
                              {chapter.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {isGenerated 
                                ? `${(chapter.word_count || 0).toLocaleString()} words`
                                : "Content pending generation"
                              }
                            </p>
                          </div>
                        </button>
                        
                        <div className="flex items-center gap-2">
                          {isGenerating ? (
                            <div className="flex items-center gap-2 text-scroll-gold">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span className="text-sm">Generating...</span>
                            </div>
                          ) : isGenerated ? (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleGenerateChapter(chapter, e)}
                                title="Regenerate chapter"
                                className="text-muted-foreground hover:text-scroll-gold"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              <ChevronRight 
                                className="h-5 w-5 text-muted-foreground group-hover:text-scroll-gold transition-all cursor-pointer"
                                onClick={() => navigate(`/read/${id}/${chapter.chapter_number}`)}
                              />
                            </div>
                          ) : (
                            <Button
                              variant="gold-outline"
                              size="sm"
                              onClick={(e) => handleGenerateChapter(chapter, e)}
                            >
                              <Sparkles className="h-4 w-4 mr-1" />
                              Generate
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
