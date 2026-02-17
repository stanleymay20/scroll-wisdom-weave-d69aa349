/**
 * CONTRACT 5B-2: Book Detail Entry Speed
 * 
 * RULES:
 * - 5B-2.1: Instant Shell - Navigate immediately with cached data
 * - 5B-2.2: Cache-Primed Entry - Prefill from route state
 * - 5B-2.3: Progressive Hydration - skeleton → cached → hydrating → ready
 * - 5B-2.4: Zero Layout Shift - Skeleton matches final layout
 * - 5B-2.5: Offline Truth - Show cached data if available
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/layout/MobileLayout";
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
  Palette,
  Trash2,
  Archive,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ShareDialog, ExportDialog, BookDetailSkeleton, ChapterManagement } from "@/components/books";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePagePerformance } from "@/lib/performance";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBookDetailData } from "@/hooks/useBookDetailData";
import { GentleOfflineBanner } from "@/components/ui/gentle-offline-banner";
import { CertificateStatusPanel } from "@/components/certificates";
import { cn } from "@/lib/utils";
import { checkPublishingGate, formatAuditReport, type PublishingGateResult } from "@/lib/bookAuditIntegration";
import { isAcademicCategory } from "@/lib/academicCategories";
import { CodeQualityBadge } from "@/components/books/CodeQualityBadge";
import { CodeAuditPanel } from "@/components/books/CodeAuditPanel";
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
  user_id: string;
  language: string | null;
  book_type: string | null;
  source_type: string | null;
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
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  // CONTRACT 4: Track TTI
  usePagePerformance('BookDetail');
  
  // CONTRACT 5B-2: Single source of truth for book detail data
  const {
    book,
    chapters,
    loadState,
    isLoading,
    user,
    isSaved,
    setIsSaved,
    setBook,
    setChapters,
  } = useBookDetailData({ bookId: id });

  // Local UI state (not related to data fetching)
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isUpdatingPublish, setIsUpdatingPublish] = useState(false);
  const [coverTheme, setCoverTheme] = useState("classic");
  const [coverAuthorName, setCoverAuthorName] = useState("");

  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [regenTarget, setRegenTarget] = useState<ChapterData | null>(null);
  const [editIntent, setEditIntent] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditResult, setAuditResult] = useState<PublishingGateResult | null>(null);
  const [showAuditDialog, setShowAuditDialog] = useState(false);

  const isOwner = user && (book?.creator_id === user.id || book?.user_id === user.id);

  const coverThemes = [
    { value: "classic", labelKey: "coverTheme.classic", descKey: "coverTheme.classicDesc" },
    { value: "modern", labelKey: "coverTheme.modern", descKey: "coverTheme.modernDesc" },
    { value: "vintage", labelKey: "coverTheme.vintage", descKey: "coverTheme.vintageDesc" },
    { value: "nature", labelKey: "coverTheme.nature", descKey: "coverTheme.natureDesc" },
    { value: "cosmic", labelKey: "coverTheme.cosmic", descKey: "coverTheme.cosmicDesc" },
    { value: "minimalist", labelKey: "coverTheme.minimalist", descKey: "coverTheme.minimalistDesc" },
    { value: "african", labelKey: "coverTheme.african", descKey: "coverTheme.africanDesc" },
    { value: "prophetic", labelKey: "coverTheme.prophetic", descKey: "coverTheme.propheticDesc" },
  ];

  const handleSaveToLibrary = async () => {
    if (!user) {
      toast({
        title: t('generate.signInRequired'),
        description: t('book.signInToSave'),
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
        toast({ title: t('book.removedFromLibrary') });
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
        toast({ title: t('book.addedToLibrary') });
      }
    }
  };

  const openRegenerateDialog = (chapter: ChapterData) => {
    setRegenTarget(chapter);
    setEditIntent("");
    setRegenDialogOpen(true);
  };

  const runChapterGeneration = async ({
    chapter,
    regenerate,
    editIntentText,
  }: {
    chapter: ChapterData;
    regenerate: boolean;
    editIntentText?: string;
  }) => {
    if (!book) return;

    setGeneratingChapterId(chapter.id);

    try {
      // Extract key topics from existing content if available
      const keyTopicsMatch = chapter.content?.match(
        /### Key Topics\n([\s\S]*?)(?:\n\n|\*Full chapter)/
      );
      const keyTopics = keyTopicsMatch
        ? keyTopicsMatch[1]
            .split("\n")
            .filter((t) => t.startsWith("-"))
            .map((t) => t.replace("- ", ""))
        : [];

      // Determine if academic mode should be enabled based on category
      const shouldEnableAcademicMode = book.book_type === 'text' && isAcademicCategory(book.category);

      const response = await supabase.functions.invoke("generate-chapter", {
        body: {
          chapterId: chapter.id,
          bookTitle: book.title,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapter_number,
          keyTopics,
          category: book.category,
          language: book.language || "en",
          bookType: book.book_type || "text",
          // Enable academic mode with real citations for academic categories
          academicMode: shouldEnableAcademicMode,
          citationStyle: 'APA', // Default to APA for academic categories
          ...(regenerate
            ? {
                regenerate: true,
                originalContent: chapter.content,
                editIntent: editIntentText,
              }
            : {}),
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);

      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === chapter.id
            ? { ...ch, is_generated: true, word_count: response.data.wordCount }
            : ch
        )
      );

      toast({
        title: regenerate ? "Chapter updated" : t("book.chapterGenerated"),
        description: `${chapter.title} ${t("book.readyToRead")}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("book.failedToGenerateChapter");
      const isMissingIntent = /EDIT_INTENT_REQUIRED/i.test(message);

      console.error("Error generating chapter:", error);
      toast({
        title: t("book.generationFailed"),
        description: isMissingIntent
          ? "Please specify what you want to change before regeneration."
          : message,
        variant: "destructive",
      });

      if (isMissingIntent) {
        openRegenerateDialog(chapter);
      }
    } finally {
      setGeneratingChapterId(null);
    }
  };

  const handleGenerateChapter = async (chapter: ChapterData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!book) return;

    // Regeneration requires explicit user intent (contract)
    if (chapter.is_generated) {
      openRegenerateDialog(chapter);
      return;
    }

    await runChapterGeneration({ chapter, regenerate: false });
  };

  const handleGenerateAllChapters = async () => {
    if (!book) return;
    
    const ungeneratedChapters = chapters.filter(ch => !ch.is_generated);
    if (ungeneratedChapters.length === 0) {
      toast({ title: t('book.allChaptersAlreadyGenerated') });
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

        // Determine if academic mode should be enabled based on category
        const shouldEnableAcademicMode = book.book_type === 'text' && isAcademicCategory(book.category);

        const response = await supabase.functions.invoke('generate-chapter', {
          body: {
            chapterId: chapter.id,
            bookTitle: book.title,
            chapterTitle: chapter.title,
            chapterNumber: chapter.chapter_number,
            keyTopics,
            category: book.category,
            language: book.language || 'en',
            bookType: book.book_type || 'text',
            // Enable academic mode with real citations for academic categories
            academicMode: shouldEnableAcademicMode,
            citationStyle: 'APA', // Default to APA for academic categories
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
          title: `${t('book.failedToGenerateChapter')} ${chapter.chapter_number}`,
          description: error instanceof Error ? error.message : t('common.unknownError'),
          variant: "destructive",
        });
        // Continue with next chapter instead of stopping
      }
    }

    setIsGeneratingAll(false);
    setGeneratingChapterId(null);
    setGenerationProgress({ current: 0, total: 0 });
    
    toast({
      title: t('book.generationComplete'),
      description: t('book.allChaptersGenerated'),
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
          authorName: coverAuthorName.trim() || book.author_ai_agent || undefined,
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
        title: t('book.coverGenerated'),
        description: t('book.coverStyleApplied'),
      });
    } catch (error) {
      console.error("Error generating cover:", error);
      toast({
        title: t('book.coverGenerationFailed'),
        description: error instanceof Error ? error.message : t('book.failedToGenerateCover'),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!book || !isOwner) return;
    
    // CONTRACT 6: If trying to publish, run audit first
    if (!book.is_published) {
      const chaptersForAudit = chapters.map(ch => ({
        id: ch.id,
        content: ch.content || '',
        is_generated: ch.is_generated,
      }));
      
      const gateResult = checkPublishingGate(book.id, book.book_type, chaptersForAudit, book.category, book.source_type);
      setAuditResult(gateResult);
      
      if (!gateResult.canPublish) {
        setShowAuditDialog(true);
        toast({
          title: "Publishing Blocked",
          description: `${gateResult.blockerReasons.length} issue(s) must be fixed before publishing.`,
          variant: "destructive",
        });
        return;
      }
      
      // Show warnings even if can publish
      if (gateResult.warnings.length > 0) {
        toast({
          title: "Publishing Warnings",
          description: `${gateResult.warnings.length} warning(s) found. Review recommended.`,
          variant: "default",
        });
      }
    }
    
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
        title: newPublishState ? t('book.published') : t('book.unpublished'),
        description: newPublishState 
          ? t('book.publishedDesc') 
          : t('book.unpublishedDesc'),
      });
    } catch (error) {
      console.error("Error updating publish status:", error);
      toast({
        title: t('book.failedToUpdate'),
        description: t('book.couldNotChangePublishStatus'),
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
        title: t('book.failedToUpdateBookType'),
        description: t('common.tryAgain'),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: t('book.bookTypeUpdated'),
      description: t('book.regenerateToApply'),
    });
  };

  // Delete book handler (for book creators only)
  const handleDeleteBook = async () => {
    if (!book || !isOwner) return;
    
    setIsDeleting(true);
    try {
      // First, delete all chapters
      const { error: chaptersError } = await supabase
        .from("chapters")
        .delete()
        .eq("book_id", book.id);
      
      if (chaptersError) throw chaptersError;

      // Delete all library entries for this book
      const { error: libraryError } = await supabase
        .from("user_library")
        .delete()
        .eq("book_id", book.id);
      
      if (libraryError) throw libraryError;

      // Finally, delete the book
      const { error: bookError } = await supabase
        .from("books")
        .delete()
        .eq("id", book.id);
      
      if (bookError) throw bookError;

      toast({
        title: "Book Deleted",
        description: `"${book.title}" has been permanently deleted.`,
      });

      // Navigate to library
      navigate("/library");
    } catch (error) {
      console.error("Error deleting book:", error);
      toast({
        title: "Failed to Delete Book",
        description: "An error occurred while deleting the book. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Archive book (unpublish and hide)
  const handleArchiveBook = async () => {
    if (!book || !isOwner) return;
    
    try {
      const { error } = await supabase
        .from("books")
        .update({ is_published: false })
        .eq("id", book.id);

      if (error) throw error;

      setBook(prev => prev ? { ...prev, is_published: false } : null);
      
      toast({
        title: "Book Archived",
        description: `"${book.title}" has been archived and is now private.`,
      });
    } catch (error) {
      console.error("Error archiving book:", error);
      toast({
        title: "Failed to Archive",
        description: "Could not archive the book. Please try again.",
        variant: "destructive",
      });
    }
  };

  // CONTRACT 5B-2: Skeleton-first loading with cached data support
  // Also handles offline states (RULE 5B-2.5)
  if (loadState === 'skeleton' || loadState === 'offline-empty') {
    const skeletonContent = (
      <>
        {loadState === 'offline-empty' && (
          <div className="container mx-auto px-4 pt-24 pb-4">
            <GentleOfflineBanner compact className="rounded-lg" />
          </div>
        )}
        <main className={loadState === 'offline-empty' ? 'pb-16' : 'pt-24 pb-16'}>
          <BookDetailSkeleton isMobile={isMobile} />
        </main>
      </>
    );

    if (isMobile) {
      return <MobileLayout>{skeletonContent}</MobileLayout>;
    }
    return (
      <div className="min-h-screen">
        <Navbar />
        {skeletonContent}
        <Footer />
      </div>
    );
  }

  // Show cached/hydrating state with actual book data
  if (!book) {
    return null;
  }

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const readingTime = Math.ceil(totalWords / 200) || 1;

  // Mobile layout wrapper - use conditional rendering, not inline component
  // (Defining wrapper inline causes remount on every state change, breaking input focus)

  const content = (
    <>

      {/* Delete Book Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Book Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{book.title}" and all its chapters. This action cannot be undone.
              <br /><br />
              <strong>Note:</strong> All reading progress from other users will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBook}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate chapter (revision)</AlertDialogTitle>
            <AlertDialogDescription>
              Describe exactly what you want changed. Without intent, regeneration is blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            value={editIntent}
            onChange={(e) => setEditIntent(e.target.value)}
            placeholder='e.g. "Shorten by 30%", "Make it more academic", "Fix formatting"'
            className="min-h-[120px]"
          />

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const intent = editIntent.trim();
                if (!regenTarget) return;
                if (!intent) {
                  toast({
                    title: "Edit intent required",
                    description: "Please specify what you want to change before regeneration.",
                    variant: "destructive",
                  });
                  return;
                }
                setRegenDialogOpen(false);
                await runChapterGeneration({
                  chapter: regenTarget,
                  regenerate: true,
                  editIntentText: intent,
                });
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                      <input
                        type="text"
                        value={coverAuthorName}
                        onChange={(e) => setCoverAuthorName(e.target.value)}
                        placeholder={book.author_ai_agent || "Author name for cover"}
                        className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />

                      <Select value={coverTheme} onValueChange={setCoverTheme}>
                        <SelectTrigger className="w-full">
                          <Palette className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Select cover theme" />
                        </SelectTrigger>
                        <SelectContent>
                          {coverThemes.map((theme) => (
                            <SelectItem key={theme.value} value={theme.value}>
                              <div className="flex flex-col">
                                <span>{t(theme.labelKey)}</span>
                                <span className="text-xs text-muted-foreground">{t(theme.descKey)}</span>
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
                            {t('book.generating')}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {book.cover_image_url ? t('book.regenerateCover') : t('book.generateCover')}
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
                        {t('book.public')}
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        {t('book.private')}
                      </>
                    )}
                  </span>
                )}
              </div>
              
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                {book.title}
              </h1>
              
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                {book.description || t('book.defaultDesc')}
              </p>

              {/* Meta */}
              <div className="flex flex-wrap gap-6 mb-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-scroll-gold" />
                  <span>{book.author_ai_agent || "ScrollAuthorGPT"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-scroll-gold" />
                  <span>{chapters.length || book.total_chapters} {t('book.chapters')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-scroll-gold" />
                  <span>{readingTime} {t('book.minRead')}</span>
                </div>
                {/* Code Quality Badge for technical books */}
                {chapters.some(ch => ch.is_generated) && (
                  <CodeQualityBadge chapters={chapters} />
                )}
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
                  {t('book.startReading')}
                </Button>
                <Button 
                  variant="gold-outline" 
                  size="lg"
                  onClick={handleSaveToLibrary}
                >
                  <Bookmark className={`h-5 w-5 mr-2 ${isSaved ? "fill-current" : ""}`} />
                  {isSaved ? t('book.saved') : t('book.saveToLibrary')}
                </Button>
                <ExportDialog 
                  bookId={book.id} 
                  title={book.title} 
                  hasGeneratedChapters={chapters.some(ch => ch.is_generated)}
                  coverImageUrl={book.cover_image_url}
                  authorName={book.author_ai_agent || undefined}
                  bookType={book.book_type || 'text'}
                  chapterContents={chapters.filter(ch => ch.is_generated).map(ch => ch.content || '')}
                  chapters={chapters.filter(ch => ch.is_generated).map(ch => ({ chapter_number: ch.chapter_number, content: ch.content }))}
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

              {/* Chapter Management for Owners */}
              {isOwner && (
                <ChapterManagement
                  bookId={book.id}
                  bookTitle={book.title}
                  chapters={chapters}
                  onChaptersChange={setChapters}
                  onBookUpdate={(updates) => {
                    if (updates.preface !== undefined) {
                      setBook(prev => prev ? { ...prev, description: updates.preface || null } : null);
                    }
                  }}
                  preface={book.description}
                  className="mt-6"
                />
              )}

              {/* Publish Toggle for Owners */}
              {isOwner && (
                <>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 mt-6">
                    <div className="flex-1">
                      <Label htmlFor="publish-toggle" className="text-foreground font-medium">
                        {t('book.publishToLibrary')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {book.is_published 
                          ? t('book.publicDesc')
                          : t('book.privateDesc')}
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
                    <Label className="text-foreground font-medium">{t('book.bookType')}</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('book.bookTypeDesc')}
                    </p>

                    <RadioGroup
                      value={(book.book_type || "text") as any}
                      onValueChange={(v) => handleUpdateBookType(v as any)}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4"
                    >
                      <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors">
                        <RadioGroupItem value="text" id="bt-text" />
                        <Label htmlFor="bt-text" className="cursor-pointer flex-1">
                          <span className="text-sm font-medium">{t('book.text')}</span>
                          <span className="block text-xs text-muted-foreground">{t('book.noImages')}</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-scroll-gold/50 transition-colors">
                        <RadioGroupItem value="illustrated" id="bt-illustrated" />
                        <Label htmlFor="bt-illustrated" className="cursor-pointer flex-1">
                          <span className="text-sm font-medium">{t('generate.illustrated')}</span>
                          <span className="block text-xs text-muted-foreground">{t('book.textIllustrations')}</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Danger Zone - Delete/Archive */}
                  <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 mt-4">
                    <Label className="text-destructive font-medium">Danger Zone</Label>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      Irreversible actions for this book.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleArchiveBook}
                        disabled={!book.is_published}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive Book
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Book
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Certificate Status Panel - Shows eligibility for readers */}
              {isSaved && (
                <CertificateStatusPanel
                  bookId={book.id}
                  bookTitle={book.title}
                  totalChapters={chapters.length}
                  completedChapters={chapters.filter(ch => ch.is_generated).length}
                  progressPercent={Math.round((chapters.filter(ch => ch.is_generated).length / Math.max(chapters.length, 1)) * 100)}
                  className="mt-6"
                />
              )}

              {/* STO Code Audit Panel for technical books */}
              {isOwner && chapters.some(ch => ch.is_generated) && (
                <CodeAuditPanel
                  bookId={book.id}
                  chapters={chapters.map(ch => ({
                    id: ch.id,
                    chapter_number: ch.chapter_number,
                    title: ch.title,
                    content: ch.content,
                    is_generated: ch.is_generated,
                  }))}
                  className="mt-6"
                />
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
                {t('book.tableOfContents')}
              </h2>
              
              {/* Generate All Button - only for owners */}
              {isOwner && chapters.some(ch => !ch.is_generated) && (
                <Button
                  variant="hero"
                  onClick={handleGenerateAllChapters}
                  disabled={isGeneratingAll || generatingChapterId !== null}
                >
                  {isGeneratingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('book.generatingProgress')} {generationProgress.current}/{generationProgress.total}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t('book.generateAllChapters')}
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
                    {t('book.generatingChapters')}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {generationProgress.current} / {generationProgress.total} {t('book.complete')}
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
                  {t('book.generationNote')}
                </p>
              </div>
            )}

            {chapters.length === 0 ? (
              <p className="text-muted-foreground">{t('book.chaptersBeingGenerated')}</p>
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
                          onClick={() => isGenerated && navigate(`/read/${id}/${chapter.chapter_number}`, {
                            state: {
                              chapterId: chapter.id,
                              bookId: id,
                              chapterNumber: chapter.chapter_number,
                              title: chapter.title,
                              wordCount: chapter.word_count,
                              content: chapter.content, // Pre-fill content for instant render
                            }
                          })}
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
                                ? `${(chapter.word_count || 0).toLocaleString()} ${t('book.wordsCount')}`
                                : t('book.contentPending')
                              }
                            </p>
                          </div>
                        </button>
                        
                        <div className="flex items-center gap-2">
                          {isGenerating ? (
                            <div className="flex items-center gap-2 text-scroll-gold">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span className="text-sm">{t('book.generating')}</span>
                            </div>
                          ) : isGenerated ? (
                            <div className="flex items-center gap-2">
                              {isOwner && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleGenerateChapter(chapter, e)}
                                  title="Regenerate chapter"
                                  className="text-muted-foreground hover:text-scroll-gold"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              )}
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              <ChevronRight 
                                className="h-5 w-5 text-muted-foreground group-hover:text-scroll-gold transition-all cursor-pointer"
                                onClick={() => navigate(`/read/${id}/${chapter.chapter_number}`, {
                                  state: {
                                    chapterId: chapter.id,
                                    bookId: id,
                                    chapterNumber: chapter.chapter_number,
                                    title: chapter.title,
                                    wordCount: chapter.word_count,
                                    content: chapter.content,
                                  }
                                })}
                              />
                            </div>
                          ) : isOwner ? (
                            <Button
                              variant="gold-outline"
                              size="sm"
                              onClick={(e) => handleGenerateChapter(chapter, e)}
                            >
                              <Sparkles className="h-4 w-4 mr-1" />
                              {t('book.generateChapter')}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t('book.contentPending')}</span>
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

      {/* Book Audit Dialog */}
      <AlertDialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Publishing Blocked
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This book cannot be published due to quality issues:</p>
                {auditResult?.blockerReasons.map((reason, i) => (
                  <p key={i} className="text-sm text-destructive">• {reason}</p>
                ))}
                {auditResult?.warnings.map((warning, i) => (
                  <p key={i} className="text-sm text-amber-600">⚠ {warning}</p>
                ))}
                {auditResult?.auditResult && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Audit Score: {auditResult.auditResult.score}/100
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isMobile) {
    return <MobileLayout>{content}</MobileLayout>;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      {content}
      <Footer />
    </div>
  );
}
