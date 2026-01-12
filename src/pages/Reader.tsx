import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Settings, 
  Bookmark,
  X,
  Home,
  Flag,
  Volume2,
  Brain,
  BookMarked,
  Palette,
  GraduationCap,
  MessageCircle,
  Mic
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TTSMiniPlayer } from "@/components/audio/TTSMiniPlayer";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";
import { CognitiveLevelSelector, COGNITIVE_LEVELS } from "@/components/reader/CognitiveLevelSelector";
import { GuidedReadingMode, CognitiveLevelIndicator } from "@/components/reader/GuidedReadingMode";
import { DeepResearchPanel } from "@/components/academic/DeepResearchPanel";
import { AcademicModeIndicator } from "@/components/academic/AcademicModeIndicator";
import { AcademicDisclaimer } from "@/components/academic/AcademicDisclaimer";
import { InteractiveQA, InteractiveQAButton } from "@/components/reader/InteractiveQA";
import { TextHighlighter } from "@/components/reader/TextHighlighter";
import { QuizMode, QuizModeButton } from "@/components/reader/QuizMode";
import { VoiceConversation, VoiceConversationButton } from "@/components/reader/VoiceConversation";
import { MarkdownRenderer } from "@/components/reader/MarkdownRenderer";
import { CitationStyle, AcademicSource } from "@/lib/citations";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePagePerformance } from "@/lib/performance";

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
  academic_mode?: boolean;
  citation_style?: string;
  chapter_references?: any[];
  research_metadata?: any;
}

// Reading theme presets
const READING_THEMES = {
  default: { bg: 'bg-scroll-indigo-deep', text: 'text-foreground/90', name: 'Default' },
  sepia: { bg: 'bg-amber-50', text: 'text-amber-900', name: 'Sepia' },
  dark: { bg: 'bg-zinc-950', text: 'text-zinc-100', name: 'Dark' },
  cream: { bg: 'bg-orange-50', text: 'text-stone-800', name: 'Cream' },
  mint: { bg: 'bg-emerald-50', text: 'text-emerald-900', name: 'Mint' },
  night: { bg: 'bg-slate-900', text: 'text-slate-100', name: 'Night Blue' },
} as const;

type ReadingTheme = keyof typeof READING_THEMES;

// PERFORMANCE: Skeleton for reader page - shown IMMEDIATELY
function ReaderSkeleton() {
  return (
    <div className="min-h-screen bg-scroll-indigo-deep">
      {/* Header skeleton */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div>
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-10 rounded" />
            ))}
          </div>
        </div>
      </header>
      
      {/* Content skeleton */}
      <main className="pt-20 pb-24 max-w-3xl mx-auto px-4 sm:px-8">
        <div className="animate-pulse space-y-4">
          <Skeleton className="h-8 w-3/4 mb-6" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" style={{ width: `${85 + Math.random() * 15}%` }} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function Reader() {
  const { t } = useLanguage();
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  
  // PERFORMANCE: Track TTI
  usePagePerformance('Reader');
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [fontSize, setFontSize] = useState(18);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>('default');
  const [showSettings, setShowSettings] = useState(false);
  const [showTTS, setShowTTS] = useState(true); // TTS mini-player visible by default
  const [showLevelSelector, setShowLevelSelector] = useState(false);
  const [showReferences, setShowReferences] = useState(false);
  const [selectedTextForTTS, setSelectedTextForTTS] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [book, setBook] = useState<BookData | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const closeTopPanels = useCallback(() => {
    setShowSettings(false);
    setShowTTS(false);
    setShowLevelSelector(false);
    setShowReferences(false);
  }, []);

  const openExclusive = useCallback(
    (panel: "settings" | "tts" | "level" | "refs") => {
      setShowSettings(panel === "settings");
      setShowTTS(panel === "tts");
      setShowLevelSelector(panel === "level");
      setShowReferences(panel === "refs");
    },
    []
  );

  // Cognitive level and reading progress
  const [cognitiveLevel, setCognitiveLevel] = useState("functional");
  const [readingProgress, setReadingProgress] = useState(0);
  const [guidedModeActive, setGuidedModeActive] = useState(true);
  const [showQA, setShowQA] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showVoiceConversation, setShowVoiceConversation] = useState(false);
  const [highlightedText, setHighlightedText] = useState("");

  const currentChapter = parseInt(chapterId || "1");

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Auth (for progress tracking)
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);

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
      } else if (chapterData) {
        setChapter({
          ...chapterData,
          chapter_references: Array.isArray(chapterData.chapter_references)
            ? chapterData.chapter_references
            : [],
          research_metadata: (chapterData.research_metadata as Record<string, any>) || {},
        });
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

  // PERFORMANCE: Show skeleton UI immediately instead of blocking loader
  if (isLoading) {
    return <ReaderSkeleton />;
  }

  // Render a single dialogue line as a speech bubble
  const renderSpeechBubble = (character: string, speech: string, key: string) => {
    // Determine bubble color based on character name hash
    const charColors = [
      'bg-blue-500/20 border-blue-500/50',
      'bg-purple-500/20 border-purple-500/50', 
      'bg-emerald-500/20 border-emerald-500/50',
      'bg-amber-500/20 border-amber-500/50',
      'bg-rose-500/20 border-rose-500/50',
      'bg-cyan-500/20 border-cyan-500/50',
    ];
    const colorIndex = character.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % charColors.length;
    const bubbleColor = charColors[colorIndex];
    
    return (
      <div key={key} className={`relative my-3 p-4 rounded-2xl border-2 ${bubbleColor} max-w-[85%] ${colorIndex % 2 === 0 ? 'ml-auto' : 'mr-auto'}`}>
        <span className="absolute -top-3 left-4 px-2 py-0.5 bg-background text-xs font-bold uppercase tracking-wide text-foreground/70 rounded">
          {character}
        </span>
        <p className="text-foreground leading-relaxed pt-1">{speech}</p>
        {/* Speech bubble tail */}
        <div className={`absolute -bottom-2 ${colorIndex % 2 === 0 ? 'right-6' : 'left-6'} w-4 h-4 rotate-45 ${bubbleColor.split(' ')[0]} border-b-2 border-r-2 ${bubbleColor.split(' ')[1]}`} />
      </div>
    );
  };

  // Parse dialogue lines and return speech bubbles
  const parseDialogueBlock = (text: string, baseKey: number) => {
    const lines = text.split('\n').filter(l => l.trim());
    const elements: React.ReactNode[] = [];
    
    lines.forEach((line, idx) => {
      // Match: - CHARACTER: "text" or CHARACTER: "text"
      const dialogueMatch = line.match(/^-?\s*([A-Z][A-Za-z0-9_\s-]+):\s*[""]([^""]+)[""]/);
      if (dialogueMatch) {
        elements.push(renderSpeechBubble(dialogueMatch[1].trim(), dialogueMatch[2].trim(), `${baseKey}-dialogue-${idx}`));
      }
    });
    
    return elements.length > 0 ? elements : null;
  };

  const renderContent = () => {
    if (!chapter?.content) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('reader.contentGenerating')}</p>
        </div>
      );
    }

    // Check if this is comic content (contains base64 images or panel markers)
    const isComicContent = chapter.content.includes('![Panel') || chapter.content.includes('Panel 1') || chapter.content.includes('[PANEL');

    return chapter.content.split('\n\n').map((paragraph, index) => {
      // Handle comic page headers
      if (paragraph.startsWith('## Page') || paragraph.match(/^Page\s+\d+/i)) {
        return (
          <h4 key={index} className="text-xl sm:text-2xl font-display font-bold text-scroll-gold mt-8 sm:mt-12 mb-4 sm:mb-6 text-center">
            {paragraph.replace(/^##\s*/, '')}
          </h4>
        );
      }
      // Handle panel markers
      if (paragraph.match(/^(?:\[PANEL\s*\d+\]|Panel\s+\d+)/i)) {
        return (
          <div key={index} className="text-center my-6">
            <Badge variant="outline" className="text-sm px-4 py-1 border-scroll-gold/50 text-scroll-gold">
              {paragraph.match(/(?:\[PANEL\s*\d+\]|Panel\s+\d+)/i)?.[0] || paragraph}
            </Badge>
          </div>
        );
      }
      // Handle comic images (base64 or URL)
      if (paragraph.startsWith('![')) {
        const imgMatch = paragraph.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          return (
            <div key={index} className="my-6 sm:my-8 flex justify-center comic-panel">
              <img 
                src={imgMatch[2]} 
                alt={imgMatch[1]} 
                className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl rounded-xl shadow-2xl"
                style={{ aspectRatio: '1/1', objectFit: 'cover' }}
              />
            </div>
          );
        }
      }
      // Handle dialogue blocks with speech bubbles (for comic content)
      if (isComicContent && (paragraph.includes('Dialogue:') || paragraph.match(/-?\s*[A-Z][A-Za-z0-9_\s-]+:\s*[""][^""]+[""]/) )) {
        const dialogueBubbles = parseDialogueBlock(paragraph, index);
        if (dialogueBubbles) {
          return (
            <div key={index} className="my-6 space-y-2">
              {dialogueBubbles}
            </div>
          );
        }
      }
      // Handle comic captions (blockquotes)
      if (paragraph.startsWith('>')) {
        return (
          <div key={index} className="comic-caption text-center text-xl sm:text-2xl font-medium text-foreground my-4 sm:my-6 px-6 sm:px-12 py-4 bg-scroll-gold/10 rounded-xl border border-scroll-gold/30 max-w-md mx-auto">
            {paragraph.replace(/^>\s*/, '')}
          </div>
        );
      }
      // Handle captions (Caption: text)
      if (paragraph.match(/^Caption:\s*/i)) {
        return (
          <div key={index} className="comic-caption text-center text-lg italic text-foreground/80 my-4 px-8 py-3 bg-muted/30 rounded-lg border border-border/50 max-w-md mx-auto">
            {paragraph.replace(/^Caption:\s*/i, '')}
          </div>
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
      // Handle Visual: descriptions in comics (show as scene description)
      if (paragraph.match(/^Visual:\s*/i)) {
        return (
          <div key={index} className="my-4 p-4 bg-muted/20 rounded-lg border-l-4 border-scroll-gold/50 text-sm text-foreground/70 italic">
            <span className="font-semibold text-foreground/90 not-italic">Scene: </span>
            {paragraph.replace(/^Visual:\s*/i, '')}
          </div>
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

  const currentTheme = READING_THEMES[readingTheme];

  return (
    <div className={`min-h-screen ${currentTheme.bg} transition-colors duration-300`}>
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
          
          <div className="flex items-center gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (showLevelSelector) {
                  setShowLevelSelector(false);
                  return;
                }
                openExclusive('level');
                setShowQA(false);
                setShowQuiz(false);
                setShowVoiceConversation(false);
              }}
              className={showLevelSelector ? "text-primary" : ""}
            >
              <Brain className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                setShowTTS(!showTTS);
              }}
              className={showTTS ? "text-primary" : ""}
              title="Toggle Audio Player"
            >
              <Volume2 className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (showReferences) {
                  setShowReferences(false);
                  return;
                }
                openExclusive('refs');
                setShowQA(false);
                setShowQuiz(false);
                setShowVoiceConversation(false);
              }}
              className={showReferences ? "text-primary" : ""}
              title="Citations & References"
            >
              <BookMarked className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (showSettings) {
                  setShowSettings(false);
                  return;
                }
                openExclusive('settings');
                setShowQA(false);
                setShowQuiz(false);
                setShowVoiceConversation(false);
              }}
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
            <span className="font-medium">{t('reader.settings')}</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                {t('reader.fontSize')}: {fontSize}px
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
            
            {/* Reading Theme Selection */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
                <Palette className="h-4 w-4" />
                {t('reader.readingTheme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(READING_THEMES) as ReadingTheme[]).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setReadingTheme(theme)}
                    className={`p-2 rounded-md text-xs font-medium transition-all ${
                      readingTheme === theme 
                        ? 'ring-2 ring-primary ring-offset-1' 
                        : 'hover:opacity-80'
                    } ${READING_THEMES[theme].bg} ${READING_THEMES[theme].text}`}
                  >
                    {READING_THEMES[theme].name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('reader.guidedMode')}</span>
              <Button
                variant={guidedModeActive ? "default" : "outline"}
                size="sm"
                onClick={() => setGuidedModeActive(!guidedModeActive)}
              >
                {guidedModeActive ? t('reader.on') : t('reader.off')}
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

      {/* TTS Mini Player - Persistent at bottom */}
      <AnimatePresence>
        {showTTS && chapter?.content && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40"
          >
            <TTSMiniPlayer
              chapterText={chapter.content}
              selectedText={selectedTextForTTS}
              language={book?.language || "en"}
              stopKey={`${bookId}-${currentChapter}`}
              onClose={() => setShowTTS(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* References/Citations Panel - Using DeepResearchPanel */}
      <AnimatePresence>
        {showReferences && chapter?.chapter_references && (
          <DeepResearchPanel
            isOpen={showReferences}
            onClose={() => setShowReferences(false)}
            sources={(chapter.chapter_references || []).map((ref: any) => ({
              id: ref.id || `ref-${Math.random()}`,
              title: ref.title || 'Unknown',
              authors: ref.authors || (ref.author ? [ref.author] : ['Unknown']),
              year: ref.year || new Date().getFullYear(),
              type: ref.type || 'article',
              doi: ref.doi,
              url: ref.url || ref.sourceUrl,
              journal: ref.journal,
              publisher: ref.publisher,
              abstract: ref.abstract,
              citationCount: ref.citationCount,
              verified: ref.verified ?? !!ref.doi,
              database: ref.database || 'Unknown',
              peerReviewed: ref.peerReviewed ?? !!ref.doi,
            } as AcademicSource))}
            metadata={{
              totalSources: chapter.chapter_references?.length || 0,
              verifiedSources: (chapter.chapter_references || []).filter((r: any) => r.doi || r.verified).length,
              peerReviewedSources: (chapter.chapter_references || []).filter((r: any) => r.peerReviewed).length,
              databasesCovered: [...new Set((chapter.chapter_references || []).map((r: any) => r.database || 'Unknown'))] as string[],
              researchDate: chapter.research_metadata?.research_date || new Date().toISOString(),
              confidenceScore: chapter.research_metadata?.confidence_score || 'moderate',
              topicCoverage: chapter.research_metadata?.topic_coverage || 50,
            }}
            citationStyle={(chapter?.citation_style || 'APA') as CitationStyle}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <main className={`pt-${guidedModeActive ? '36' : '24'} pb-24`}>
        <article className="container mx-auto px-4 max-w-3xl" ref={contentRef}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* Academic Mode Indicator */}
            {chapter?.academic_mode && (
              <AcademicModeIndicator 
                isAcademicMode={true} 
                citationStyle={chapter?.citation_style || 'APA'} 
                className="mb-4"
              />
            )}

            {/* AI Disclaimer */}
            {chapter?.academic_mode ? (
              <AcademicDisclaimer variant="compact" className="mb-6" />
            ) : (
              <ContentDisclaimer type="ai" className="mb-6" />
            )}

            <h2 className={`font-display text-3xl md:text-4xl font-bold mb-2 ${readingTheme === 'default' ? 'text-gradient-gold' : currentTheme.text}`}>
              {t('reader.chapter')} {currentChapter}
            </h2>
            <h3 className={`font-display text-xl md:text-2xl mb-8 ${currentTheme.text} opacity-80`}>
              {chapter?.title || "Loading..."}
            </h3>
            
            {/* Word count and time estimate */}
            <div className={`flex items-center gap-4 mb-8 text-sm ${currentTheme.text} opacity-60`}>
              <span>{wordCount.toLocaleString()} {t('reader.words')}</span>
              <span>•</span>
              <span>~{estimatedReadingTime} {t('reader.minRead')}</span>
            </div>
            
            <TextHighlighter onAskAboutSelection={(text) => {
              // Update TTS selection text
              setSelectedTextForTTS(text);
              setHighlightedText(text);
              closeTopPanels();
              setShowQuiz(false);
              setShowVoiceConversation(false);
              setShowQA(true);
              // Show TTS player if hidden
              setShowTTS(true);
            }}>
              <div 
                className={`reading-content ${currentTheme.text}`}
                style={{ fontSize: `${fontSize}px` }}
                onMouseUp={() => {
                  // Capture selected text for TTS
                  const selection = window.getSelection();
                  if (selection && selection.toString().trim().length > 10) {
                    setSelectedTextForTTS(selection.toString().trim());
                  }
                }}
              >
                {renderContent()}
              </div>
            </TextHighlighter>
          </motion.div>
        </article>
      </main>

      {/* Floating Cognitive Level Indicator */}
      {guidedModeActive && !showLevelSelector && !showQA && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
          <CognitiveLevelIndicator
            level={cognitiveLevel}
            progress={readingProgress}
            onClick={() => setShowLevelSelector(true)}
          />
        </div>
      )}

      {/* Interactive Q&A Button + Quiz Button + Voice Button */}
       {chapter?.content && !showQA && !showVoiceConversation && (
         <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2">
           <VoiceConversationButton 
             onClick={() => {
               closeTopPanels();
               setShowQA(false);
               setShowQuiz(false);
               setShowVoiceConversation(true);
             }} 
             cognitiveLevel={cognitiveLevel}
           />
           <QuizModeButton onClick={() => {
             closeTopPanels();
             setShowQA(false);
             setShowVoiceConversation(false);
             setShowQuiz(true);
           }} />
           <InteractiveQAButton onClick={() => {
             closeTopPanels();
             setShowQuiz(false);
             setShowVoiceConversation(false);
             setShowQA(true);
           }} />
         </div>
       )}

      {/* Quiz Mode */}
      {chapter?.content && (
        <QuizMode
          isOpen={showQuiz}
          onClose={() => setShowQuiz(false)}
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book?.title || ""}
          bookId={bookId || ""}
          chapterId={chapter.id}
        />
      )}

      {/* Interactive Q&A Panel */}
      {chapter?.content && (
        <InteractiveQA
          isOpen={showQA}
          onClose={() => { setShowQA(false); setHighlightedText(""); }}
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book?.title || ""}
          bookId={bookId}
          chapterId={chapter.id}
          highlightedText={highlightedText}
          onClearHighlight={() => setHighlightedText("")}
        />
      )}

      {/* Voice Conversation */}
      <AnimatePresence>
        {showVoiceConversation && chapter?.content && (
          <VoiceConversation
            chapterContent={chapter.content}
            chapterTitle={chapter.title}
            bookTitle={book?.title || ""}
            cognitiveLevel={cognitiveLevel}
            bookId={bookId || ""}
            chapterId={chapter.id}
            onClose={() => setShowVoiceConversation(false)}
          />
        )}
      </AnimatePresence>

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
            {t('reader.previous')}
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
            {t('reader.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
