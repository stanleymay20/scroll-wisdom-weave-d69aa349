import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Settings, 
  Bookmark,
  X,
  Home,
  Loader2,
  Flag,
  Volume2,
  Brain
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TextToSpeechPlayer } from "@/components/audio/TextToSpeechPlayer";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";
import { CognitiveLevelSelector, COGNITIVE_LEVELS } from "@/components/reader/CognitiveLevelSelector";
import { GuidedReadingMode, CognitiveLevelIndicator } from "@/components/reader/GuidedReadingMode";

interface BookData {
  id: string;
  title: string;
  total_chapters: number | null;
  language: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  word_count: number | null;
}

export default function Reader() {
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [showTTS, setShowTTS] = useState(false);
  const [showLevelSelector, setShowLevelSelector] = useState(false);
  const [book, setBook] = useState<BookData | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Cognitive level and reading progress
  const [cognitiveLevel, setCognitiveLevel] = useState("functional");
  const [readingProgress, setReadingProgress] = useState(0);
  const [guidedModeActive, setGuidedModeActive] = useState(true);
  
  const currentChapter = parseInt(chapterId || "1");

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch book
      const { data: bookData, error: bookError } = await supabase
        .from("books")
        .select("id, title, total_chapters, language")
        .eq("id", bookId)
        .single();

      if (bookError) {
        console.error("Error fetching book:", bookError);
        navigate("/explore");
        return;
      }

      setBook(bookData);

      // Fetch chapter
      const { data: chapterData, error: chapterError } = await supabase
        .from("chapters")
        .select("*")
        .eq("book_id", bookId)
        .eq("chapter_number", currentChapter)
        .single();

      if (chapterError) {
        console.error("Error fetching chapter:", chapterError);
      } else {
        setChapter(chapterData);
      }

      setIsLoading(false);
    };

    if (bookId) {
      fetchData();
      setReadingProgress(0); // Reset progress on chapter change
    }
  }, [bookId, currentChapter, navigate]);

  // Track scroll progress
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    
    const element = contentRef.current;
    const scrollTop = window.scrollY - element.offsetTop + window.innerHeight;
    const scrollHeight = element.scrollHeight;
    const progress = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
    
    setReadingProgress(progress);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const totalChapters = book?.total_chapters || 1;
  const wordCount = chapter?.word_count || 0;
  const estimatedReadingTime = Math.ceil(wordCount / 200); // 200 wpm average

  if (isLoading) {
    return (
      <div className="min-h-screen bg-scroll-indigo-deep flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-scroll-gold" />
      </div>
    );
  }

  const renderContent = () => {
    if (!chapter?.content) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chapter content is being generated...</p>
        </div>
      );
    }

    // Check if this is comic content (contains base64 images or panel markers)
    const isComicContent = chapter.content.includes('![Panel') || chapter.content.includes('## Page');

    return chapter.content.split('\n\n').map((paragraph, index) => {
      // Handle comic page headers
      if (paragraph.startsWith('## Page')) {
        return (
          <h4 key={index} className="text-xl sm:text-2xl font-display font-bold text-scroll-gold mt-8 sm:mt-12 mb-4 sm:mb-6 text-center">
            {paragraph.replace('## ', '')}
          </h4>
        );
      }
      // Handle comic images (base64 or URL)
      if (paragraph.startsWith('![')) {
        const imgMatch = paragraph.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          return (
            <div key={index} className="my-4 sm:my-6 flex justify-center">
              <img 
                src={imgMatch[2]} 
                alt={imgMatch[1]} 
                className="w-full max-w-md sm:max-w-lg lg:max-w-xl rounded-xl shadow-lg border border-border/50"
              />
            </div>
          );
        }
      }
      // Handle comic captions (blockquotes)
      if (paragraph.startsWith('>')) {
        return (
          <blockquote key={index} className="text-center text-lg sm:text-xl italic text-foreground/90 my-4 sm:my-6 px-4 sm:px-8 py-3 bg-muted/30 rounded-lg border-l-4 border-scroll-gold">
            {paragraph.replace(/^>\s*/, '')}
          </blockquote>
        );
      }
      // Handle section dividers
      if (paragraph === '---') {
        return <hr key={index} className="my-6 sm:my-8 border-border/50" />;
      }
      if (paragraph.startsWith('## ')) {
        return (
          <h4 key={index} className="text-xl sm:text-2xl font-display font-bold text-scroll-gold mt-8 sm:mt-12 mb-4 sm:mb-6">
            {paragraph.replace('## ', '')}
          </h4>
        );
      }
      if (paragraph.startsWith('### ')) {
        return (
          <h5 key={index} className="text-lg sm:text-xl font-display font-semibold text-foreground/90 mt-6 sm:mt-8 mb-3 sm:mb-4">
            {paragraph.replace('### ', '')}
          </h5>
        );
      }
      if (paragraph.startsWith('- ')) {
        return (
          <ul key={index} className="list-disc list-inside mb-4 space-y-2 text-sm sm:text-base">
            {paragraph.split('\n').map((item, i) => (
              <li key={i} className="text-foreground/80">{item.replace('- ', '')}</li>
            ))}
          </ul>
        );
      }
      // Handle italic text in comic content
      if (paragraph.startsWith('*[Illustration:')) {
        return (
          <div key={index} className="text-center text-muted-foreground italic my-4 p-4 bg-muted/20 rounded-lg text-sm">
            {paragraph.replace(/^\*|\*$/g, '')}
          </div>
        );
      }
      if (paragraph.startsWith('*') && paragraph.endsWith('*')) {
        return (
          <p key={index} className="text-center text-muted-foreground italic my-4 text-sm sm:text-base">
            {paragraph.replace(/^\*|\*$/g, '')}
          </p>
        );
      }
      return (
        <p key={index} className="mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
          {paragraph}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-scroll-indigo-deep">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(`/book/${bookId}`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-sm font-medium line-clamp-1">
                {book?.title || "Loading..."}
              </h1>
              <p className="text-xs text-muted-foreground">
                Chapter {currentChapter} of {totalChapters}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowLevelSelector(!showLevelSelector)}
              className={showLevelSelector ? "text-primary" : ""}
            >
              <Brain className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowTTS(!showTTS)}
              className={showTTS ? "text-primary" : ""}
            >
              <Volume2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <ReportContentDialog 
              contentType="chapter" 
              contentId={chapter?.id || ""} 
              contentTitle={chapter?.title}
              trigger={
                <Button variant="ghost" size="icon">
                  <Flag className="h-5 w-5" />
                </Button>
              }
            />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/")}
            >
              <Home className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Guided Reading Progress Bar */}
      {guidedModeActive && chapter?.content && (
        <div className="fixed top-14 left-0 right-0 z-40">
          <GuidedReadingMode
            cognitiveLevel={cognitiveLevel}
            currentProgress={readingProgress}
            chapterNumber={currentChapter}
            totalChapters={totalChapters}
            wordCount={wordCount}
          />
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-14 right-4 z-50 bg-card rounded-lg border border-border shadow-lg p-4 w-64"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium">Reading Settings</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Font Size: {fontSize}px
              </label>
              <input
                type="range"
                min="14"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Guided Mode</span>
              <Button
                variant={guidedModeActive ? "default" : "outline"}
                size="sm"
                onClick={() => setGuidedModeActive(!guidedModeActive)}
              >
                {guidedModeActive ? "On" : "Off"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Cognitive Level Selector Panel */}
      <AnimatePresence>
        {showLevelSelector && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-14 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
          >
            <CognitiveLevelSelector
              selectedLevel={cognitiveLevel}
              onSelectLevel={setCognitiveLevel}
              estimatedReadingTime={estimatedReadingTime}
              onStartReading={() => setShowLevelSelector(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* TTS Player */}
      {showTTS && chapter?.content && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-32 left-1/2 -translate-x-1/2 z-40"
        >
          <TextToSpeechPlayer text={chapter.content} language={book?.language || "en"} />
        </motion.div>
      )}

      {/* Content */}
      <main className={`pt-${guidedModeActive ? '36' : '24'} pb-24`}>
        <article className="container mx-auto px-4 max-w-3xl" ref={contentRef}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* AI Disclaimer */}
            <ContentDisclaimer type="ai" className="mb-6" />

            <h2 className="font-display text-3xl md:text-4xl font-bold mb-2 text-gradient-gold">
              Chapter {currentChapter}
            </h2>
            <h3 className="font-display text-xl md:text-2xl text-foreground/80 mb-8">
              {chapter?.title || "Loading..."}
            </h3>
            
            {/* Word count and time estimate */}
            <div className="flex items-center gap-4 mb-8 text-sm text-muted-foreground">
              <span>{wordCount.toLocaleString()} words</span>
              <span>•</span>
              <span>~{estimatedReadingTime} min read</span>
            </div>
            
            <div 
              className="reading-content text-foreground/90"
              style={{ fontSize: `${fontSize}px` }}
            >
              {renderContent()}
            </div>
          </motion.div>
        </article>
      </main>

      {/* Floating Cognitive Level Indicator */}
      {guidedModeActive && !showLevelSelector && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
          <CognitiveLevelIndicator
            level={cognitiveLevel}
            progress={readingProgress}
            onClick={() => setShowLevelSelector(true)}
          />
        </div>
      )}

      {/* Navigation Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`/read/${bookId}/${currentChapter - 1}`)}
            disabled={currentChapter <= 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-scroll-gold" />
            <span className="text-sm text-muted-foreground">
              {currentChapter} / {totalChapters}
            </span>
          </div>

          <Button
            variant="ghost"
            onClick={() => navigate(`/read/${bookId}/${currentChapter + 1}`)}
            disabled={currentChapter >= totalChapters}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
