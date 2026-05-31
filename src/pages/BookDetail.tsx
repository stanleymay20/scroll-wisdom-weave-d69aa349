/**
 * CONTRACT 5B-2: Book Detail Entry Speed
 * Decomposed into sub-components for TTI optimization.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { MobileBookDetailHeader } from "@/components/mobile/MobileBookDetailHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2, RefreshCw, Palette, Flag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookDetailSkeleton, ExportDialog } from "@/components/books";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePagePerformance } from "@/lib/performance";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBookDetailData } from "@/hooks/useBookDetailData";
import { GentleOfflineBanner } from "@/components/ui/gentle-offline-banner";
import { CertificateStatusPanel } from "@/components/certificates";
import { cn } from "@/lib/utils";
import { checkPublishingGate, type PublishingGateResult } from "@/lib/bookAuditIntegration";
import { isAcademicCategory } from "@/lib/academicCategories";
import { ChiefEditorPanel } from "@/components/books/ChiefEditorPanel";
import { CodeAuditPanel } from "@/components/books/CodeAuditPanel";
import { BookDetailHeader } from "@/components/books/BookDetailHeader";
import { CustomCoverUploadButton } from "@/components/books/CustomCoverUploadButton";
import { BookOwnerControls } from "@/components/books/BookOwnerControls";
import { ChapterList } from "@/components/books/ChapterList";

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
  
  usePagePerformance('BookDetail');
  
  const {
    book, chapters, loadState, user, isSaved, setIsSaved, setBook, setChapters,
  } = useBookDetailData({ bookId: id });

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
    { value: "classic", labelKey: "coverTheme.classic" },
    { value: "modern", labelKey: "coverTheme.modern" },
    { value: "vintage", labelKey: "coverTheme.vintage" },
    { value: "nature", labelKey: "coverTheme.nature" },
    { value: "cosmic", labelKey: "coverTheme.cosmic" },
    { value: "minimalist", labelKey: "coverTheme.minimalist" },
    { value: "african", labelKey: "coverTheme.african" },
    { value: "prophetic", labelKey: "coverTheme.prophetic" },
  ];

  // --- Handlers ---

  const handleSaveToLibrary = async () => {
    if (!user) {
      toast({ title: t('generate.signInRequired'), description: t('book.signInToSave') });
      navigate("/auth", { state: { redirectTo: `/book/${id}` } });
      return;
    }
    if (isSaved) {
      const { error } = await supabase.from("user_library").delete().eq("user_id", user.id).eq("book_id", id);
      if (!error) { setIsSaved(false); toast({ title: t('book.removedFromLibrary') }); }
    } else {
      const { error } = await supabase.from("user_library").insert({ user_id: user.id, book_id: id, progress_percent: 0, last_read_chapter: 1 });
      if (!error) { setIsSaved(true); toast({ title: t('book.addedToLibrary') }); }
    }
  };

  const openRegenerateDialog = (chapter: ChapterData) => {
    setRegenTarget(chapter);
    setEditIntent("");
    setRegenDialogOpen(true);
  };

  const runChapterGeneration = async ({ chapter, regenerate, editIntentText }: { chapter: ChapterData; regenerate: boolean; editIntentText?: string }) => {
    if (!book) return;
    setGeneratingChapterId(chapter.id);
    try {
      const keyTopicsMatch = chapter.content?.match(/### Key Topics\n([\s\S]*?)(?:\n\n|\*Full chapter)/);
      const keyTopics = keyTopicsMatch ? keyTopicsMatch[1].split("\n").filter((t) => t.startsWith("-")).map((t) => t.replace("- ", "")) : [];
      const shouldEnableAcademicMode = book.book_type === 'text' && isAcademicCategory(book.category);
      const response = await supabase.functions.invoke("generate-chapter", {
        body: {
          chapterId: chapter.id, bookTitle: book.title, chapterTitle: chapter.title, chapterNumber: chapter.chapter_number,
          keyTopics, category: book.category, language: book.language || "en", bookType: book.book_type || "text",
          academicMode: shouldEnableAcademicMode, citationStyle: 'APA',
          ...(regenerate ? { regenerate: true, originalContent: chapter.content, editIntent: editIntentText } : {}),
        },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      setChapters((prev) => prev.map((ch) => ch.id === chapter.id ? { ...ch, is_generated: true, word_count: response.data.wordCount } : ch));
      toast({ title: regenerate ? "Chapter updated" : t("book.chapterGenerated"), description: `${chapter.title} ${t("book.readyToRead")}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("book.failedToGenerateChapter");
      const isMissingIntent = /EDIT_INTENT_REQUIRED/i.test(message);
      console.error("Error generating chapter:", error);
      toast({ title: t("book.generationFailed"), description: isMissingIntent ? "Please specify what you want to change before regeneration." : message, variant: "destructive" });
      if (isMissingIntent) openRegenerateDialog(chapter);
    } finally {
      setGeneratingChapterId(null);
    }
  };

  const handleGenerateChapter = async (chapter: ChapterData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!book) return;
    if (chapter.is_generated) { openRegenerateDialog(chapter); return; }
    await runChapterGeneration({ chapter, regenerate: false });
  };

  const handleGenerateAllChapters = async () => {
    if (!book) return;
    const ungeneratedChapters = chapters.filter(ch => !ch.is_generated);
    if (ungeneratedChapters.length === 0) { toast({ title: t('book.allChaptersAlreadyGenerated') }); return; }
    setIsGeneratingAll(true);
    setGenerationProgress({ current: 0, total: ungeneratedChapters.length });
    for (let i = 0; i < ungeneratedChapters.length; i++) {
      const chapter = ungeneratedChapters[i];
      setGeneratingChapterId(chapter.id);
      setGenerationProgress({ current: i + 1, total: ungeneratedChapters.length });
      try {
        const keyTopicsMatch = chapter.content?.match(/### Key Topics\n([\s\S]*?)(?:\n\n|\*Full chapter)/);
        const keyTopics = keyTopicsMatch ? keyTopicsMatch[1].split('\n').filter(t => t.startsWith('-')).map(t => t.replace('- ', '')) : [];
        const shouldEnableAcademicMode = book.book_type === 'text' && isAcademicCategory(book.category);
        const response = await supabase.functions.invoke('generate-chapter', {
          body: { chapterId: chapter.id, bookTitle: book.title, chapterTitle: chapter.title, chapterNumber: chapter.chapter_number, keyTopics, category: book.category, language: book.language || 'en', bookType: book.book_type || 'text', academicMode: shouldEnableAcademicMode, citationStyle: 'APA' }
        });
        if (response.error || response.data?.error) throw new Error(response.error?.message || response.data?.error);
        setChapters(prev => prev.map(ch => ch.id === chapter.id ? { ...ch, is_generated: true, word_count: response.data.wordCount } : ch));
      } catch (error) {
        console.error(`Error generating chapter ${chapter.chapter_number}:`, error);
        toast({ title: `${t('book.failedToGenerateChapter')} ${chapter.chapter_number}`, description: error instanceof Error ? error.message : t('common.unknownError'), variant: "destructive" });
      }
    }
    setIsGeneratingAll(false);
    setGeneratingChapterId(null);
    setGenerationProgress({ current: 0, total: 0 });
    toast({ title: t('book.generationComplete'), description: t('book.allChaptersGenerated') });
  };

  const handleGenerateCover = async () => {
    if (!book) return;
    setIsGeneratingCover(true);
    try {
      const response = await supabase.functions.invoke('generate-cover', {
        body: { bookId: book.id, title: book.title, category: book.category, description: book.description, theme: coverTheme, authorName: coverAuthorName.trim() || book.author_ai_agent || undefined }
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      setBook(prev => prev ? { ...prev, cover_image_url: response.data.coverUrl } : null);
      toast({ title: t('book.coverGenerated'), description: t('book.coverStyleApplied') });
    } catch (error) {
      console.error("Error generating cover:", error);
      toast({ title: t('book.coverGenerationFailed'), description: error instanceof Error ? error.message : t('book.failedToGenerateCover'), variant: "destructive" });
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!book || !isOwner) return;
    if (!book.is_published) {
      const chaptersForAudit = chapters.map(ch => ({ id: ch.id, content: ch.content || '', is_generated: ch.is_generated }));
      const gateResult = checkPublishingGate(book.id, book.book_type, chaptersForAudit, book.category, book.source_type);
      setAuditResult(gateResult);
      if (!gateResult.canPublish) { setShowAuditDialog(true); toast({ title: "Publishing Blocked", description: `${gateResult.blockerReasons.length} issue(s) must be fixed.`, variant: "destructive" }); return; }
      if (gateResult.warnings.length > 0) toast({ title: "Publishing Warnings", description: `${gateResult.warnings.length} warning(s) found.`, variant: "default" });
    }
    setIsUpdatingPublish(true);
    try {
      const newPublishState = !book.is_published;
      const { error } = await supabase.from("books").update({ is_published: newPublishState }).eq("id", book.id);
      if (error) throw error;
      setBook(prev => prev ? { ...prev, is_published: newPublishState } : null);
      toast({ title: newPublishState ? t('book.published') : t('book.unpublished'), description: newPublishState ? t('book.publishedDesc') : t('book.unpublishedDesc') });
    } catch (error) {
      console.error("Error updating publish status:", error);
      toast({ title: t('book.failedToUpdate'), description: t('book.couldNotChangePublishStatus'), variant: "destructive" });
    } finally {
      setIsUpdatingPublish(false);
    }
  };

  const handleUpdateBookType = async (nextType: "text" | "illustrated" | "comic") => {
    if (!book || !isOwner) return;
    const prevType = book.book_type || "text";
    setBook(prev => (prev ? { ...prev, book_type: nextType } : prev));
    const { error } = await supabase.from("books").update({ book_type: nextType }).eq("id", book.id);
    if (error) {
      console.error("Error updating book type:", error);
      setBook(prev => (prev ? { ...prev, book_type: prevType } : prev));
      toast({ title: t('book.failedToUpdateBookType'), description: t('common.tryAgain'), variant: "destructive" });
      return;
    }
    toast({ title: t('book.bookTypeUpdated'), description: t('book.regenerateToApply') });
  };

  const handleDeleteBook = async () => {
    if (!book || !isOwner) return;
    setIsDeleting(true);
    try {
      await supabase.from("chapters").delete().eq("book_id", book.id);
      await supabase.from("user_library").delete().eq("book_id", book.id);
      const { error } = await supabase.from("books").delete().eq("id", book.id);
      if (error) throw error;
      toast({ title: "Book Deleted", description: `"${book.title}" has been permanently deleted.` });
      navigate("/library");
    } catch (error) {
      console.error("Error deleting book:", error);
      toast({ title: "Failed to Delete Book", description: "An error occurred. Please try again.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleArchiveBook = async () => {
    if (!book || !isOwner) return;
    try {
      const { error } = await supabase.from("books").update({ is_published: false }).eq("id", book.id);
      if (error) throw error;
      setBook(prev => prev ? { ...prev, is_published: false } : null);
      toast({ title: "Book Archived", description: `"${book.title}" has been archived.` });
    } catch (error) {
      console.error("Error archiving book:", error);
      toast({ title: "Failed to Archive", description: "Could not archive the book.", variant: "destructive" });
    }
  };

  const navigateToChapter = (chapter: ChapterData) => {
    navigate(`/read/${id}/${chapter.chapter_number}`, {
      state: { chapterId: chapter.id, bookId: id, chapterNumber: chapter.chapter_number, title: chapter.title, wordCount: chapter.word_count, content: chapter.content }
    });
  };

  // --- Render ---

  if (loadState === 'skeleton' || loadState === 'offline-empty') {
    const skeletonContent = (
      <>
        {loadState === 'offline-empty' && <div className="container mx-auto px-4 pt-24 pb-4"><GentleOfflineBanner compact className="rounded-lg" /></div>}
        <main className={loadState === 'offline-empty' ? 'pb-16' : 'pt-24 pb-16'}><BookDetailSkeleton isMobile={isMobile} /></main>
      </>
    );
    if (isMobile) return <MobileLayout>{skeletonContent}</MobileLayout>;
    return <div className="min-h-screen"><Navbar />{skeletonContent}<Footer /></div>;
  }

  if (!book) return null;

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const readingTime = Math.ceil(totalWords / 200) || 1;
  const hasGeneratedChapters = chapters.some(ch => ch.is_generated);
  const chapterMapForPanels = chapters.map(ch => ({ id: ch.id, chapter_number: ch.chapter_number, title: ch.title, content: ch.content, is_generated: ch.is_generated }));

  const content = (
    <>
      {/* Mobile Back */}
      {isMobile && (
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30 px-4 py-2" style={{ marginTop: "-56px", paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-muted-foreground -ml-2"><ChevronLeft className="h-5 w-5 mr-1" />Back</Button>
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <MobileBookDetailHeader
          book={book} chaptersCount={chapters.length || book.total_chapters || 0} readingTime={readingTime}
          isSaved={isSaved} isOwner={!!isOwner} hasGeneratedChapters={hasGeneratedChapters}
          onSave={handleSaveToLibrary} onStartReading={() => navigate(`/read/${id}/1`)}
          onShare={async () => {
            const bookUrl = `${window.location.origin}/book/${id}`;
            if (navigator.share) { try { await navigator.share({ title: book.title, text: book.description || book.title, url: bookUrl }); } catch {} }
            else { try { await navigator.clipboard.writeText(bookUrl); toast({ title: "Link copied!" }); } catch { toast({ title: "Could not share", variant: "destructive" }); } }
          }}
        />
      )}

      {/* Regenerate Dialog */}
      <AlertDialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate chapter (revision)</AlertDialogTitle>
            <AlertDialogDescription>Describe exactly what you want changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={editIntent} onChange={(e) => setEditIntent(e.target.value)} placeholder='e.g. "Shorten by 30%", "Make it more academic"' className="min-h-[120px]" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const intent = editIntent.trim();
              if (!regenTarget) return;
              if (!intent) { toast({ title: "Edit intent required", description: "Please specify what you want to change.", variant: "destructive" }); return; }
              setRegenDialogOpen(false);
              await runChapterGeneration({ chapter: regenTarget, regenerate: true, editIntentText: intent });
            }}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className={cn("pb-16", isMobile ? "pt-4" : "pt-24")}>
        <div className="container mx-auto px-4">
          {/* Desktop Header */}
          {!isMobile && (
            <>
              <BookDetailHeader
                book={book} chapters={chapters} readingTime={readingTime} isSaved={isSaved} isOwner={!!isOwner}
                coverTheme={coverTheme} coverAuthorName={coverAuthorName} isGeneratingCover={isGeneratingCover}
                onCoverThemeChange={setCoverTheme} onCoverAuthorNameChange={setCoverAuthorName}
                onGenerateCover={handleGenerateCover} onSaveToLibrary={handleSaveToLibrary}
                onCoverUploaded={(url) => setBook(prev => prev ? { ...prev, cover_image_url: url } : null)}
                onStartReading={() => navigate(`/read/${id}/1`)}
              />

              {/* Desktop Owner Controls */}
              {isOwner && (
                <BookOwnerControls
                  book={book} chapters={chapters} isMobile={false}
                  isUpdatingPublish={isUpdatingPublish} isDeleting={isDeleting} deleteDialogOpen={deleteDialogOpen}
                  onTogglePublish={handleTogglePublish} onUpdateBookType={handleUpdateBookType}
                  onArchive={handleArchiveBook} onDelete={handleDeleteBook} onDeleteDialogChange={setDeleteDialogOpen}
                  onChaptersChange={setChapters} onBookUpdate={(updates) => { if (updates.preface !== undefined) setBook(prev => prev ? { ...prev, description: updates.preface || null } : null); }}
                />
              )}

              {isSaved && (
                <CertificateStatusPanel bookId={book.id} bookTitle={book.title} totalChapters={chapters.length}
                  completedChapters={chapters.filter(ch => ch.is_generated).length}
                  progressPercent={Math.round((chapters.filter(ch => ch.is_generated).length / Math.max(chapters.length, 1)) * 100)} className="mt-6" />
              )}

              {isOwner && hasGeneratedChapters && (
                <>
                  <ChiefEditorPanel bookId={book.id} chapters={chapterMapForPanels} className="mt-6" />
                  <CodeAuditPanel bookId={book.id} chapters={chapterMapForPanels} className="mt-6" />
                </>
              )}

              <ContentDisclaimer type="ai" className="mt-6" />
            </>
          )}

          {/* Mobile Panels */}
          {isMobile && isOwner && hasGeneratedChapters && (
            <div className="px-4 mt-4 space-y-4">
              <ChiefEditorPanel bookId={book.id} chapters={chapterMapForPanels} />
              <CodeAuditPanel bookId={book.id} chapters={chapterMapForPanels} />
            </div>
          )}

          {/* Mobile Cover Controls */}
          {isMobile && isOwner && (
            <div className="px-4 mt-4 space-y-2">
              <div className="flex gap-2">
                <Select value={coverTheme} onValueChange={setCoverTheme}>
                  <SelectTrigger className="flex-1 h-9 text-xs"><Palette className="h-3.5 w-3.5 mr-1.5" /><SelectValue placeholder="Theme" /></SelectTrigger>
                  <SelectContent>{coverThemes.map((theme) => (<SelectItem key={theme.value} value={theme.value}>{t(theme.labelKey)}</SelectItem>))}</SelectContent>
                </Select>
                <Button variant="gold-outline" size="sm" className="h-9 text-xs" onClick={handleGenerateCover} disabled={isGeneratingCover}>
                  {isGeneratingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Cover</>}
                </Button>
              </div>
            </div>
          )}

          {/* Mobile Export/Report */}
          {isMobile && (
            <div className="px-4 mt-4 flex flex-wrap gap-2">
              <ExportDialog bookId={book.id} title={book.title} hasGeneratedChapters={hasGeneratedChapters}
                coverImageUrl={book.cover_image_url} authorName={book.author_ai_agent || undefined}
                bookType={book.book_type || 'text'} chapterContents={chapters.filter(ch => ch.is_generated).map(ch => ch.content || '')}
                chapters={chapters.filter(ch => ch.is_generated).map(ch => ({ chapter_number: ch.chapter_number, content: ch.content }))} />
              <ReportContentDialog contentType="book" contentId={book.id} contentTitle={book.title} />
            </div>
          )}

          {/* Mobile Owner Controls */}
          {isMobile && isOwner && (
            <div className="px-4 mt-4 space-y-4">
              <BookOwnerControls
                book={book} chapters={chapters} isMobile={true}
                isUpdatingPublish={isUpdatingPublish} isDeleting={isDeleting} deleteDialogOpen={deleteDialogOpen}
                onTogglePublish={handleTogglePublish} onUpdateBookType={handleUpdateBookType}
                onArchive={handleArchiveBook} onDelete={handleDeleteBook} onDeleteDialogChange={setDeleteDialogOpen}
                onChaptersChange={setChapters} onBookUpdate={(updates) => { if (updates.preface !== undefined) setBook(prev => prev ? { ...prev, description: updates.preface || null } : null); }}
              />
            </div>
          )}

          {/* Mobile Certificate */}
          {isMobile && isSaved && (
            <div className="px-4 mt-4">
              <CertificateStatusPanel bookId={book.id} bookTitle={book.title} totalChapters={chapters.length}
                completedChapters={chapters.filter(ch => ch.is_generated).length}
                progressPercent={Math.round((chapters.filter(ch => ch.is_generated).length / Math.max(chapters.length, 1)) * 100)} />
            </div>
          )}

          {isMobile && <div className="px-4 mt-4"><ContentDisclaimer type="ai" /></div>}

          {/* Chapter List */}
          <ChapterList
            bookId={book.id} chapters={chapters} isOwner={!!isOwner}
            generatingChapterId={generatingChapterId} isGeneratingAll={isGeneratingAll} generationProgress={generationProgress}
            onGenerateChapter={handleGenerateChapter} onGenerateAll={handleGenerateAllChapters} onNavigateToChapter={navigateToChapter}
          />
        </div>
      </main>

      {/* Audit Dialog */}
      <AlertDialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Flag className="h-5 w-5 text-destructive" />Publishing Blocked</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This book cannot be published due to quality issues:</p>
                {auditResult?.blockerReasons.map((reason, i) => <p key={i} className="text-sm text-destructive">• {reason}</p>)}
                {auditResult?.warnings.map((warning, i) => <p key={i} className="text-sm text-amber-600">⚠ {warning}</p>)}
                {auditResult?.auditResult && <p className="text-xs text-muted-foreground mt-2">Audit Score: {auditResult.auditResult.score}/100</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (isMobile) return <MobileLayout>{content}</MobileLayout>;
  return <div className="min-h-screen"><Navbar />{content}<Footer /></div>;
}
