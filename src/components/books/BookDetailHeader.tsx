import { motion } from "framer-motion";
import { stripMarkdownInline } from "@/lib/stripMarkdownInline";
import { Book, BookOpen, Clock, User, Play, Bookmark, Loader2, RefreshCw, Palette, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShareDialog, ExportDialog } from "@/components/books";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { CodeQualityBadge } from "@/components/books/CodeQualityBadge";
import { CollaborationPanel } from "@/components/books/CollaborationPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

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

interface BookDetailHeaderProps {
  book: BookData;
  chapters: ChapterData[];
  readingTime: number;
  isSaved: boolean;
  isOwner: boolean;
  coverTheme: string;
  coverAuthorName: string;
  isGeneratingCover: boolean;
  onCoverThemeChange: (theme: string) => void;
  onCoverAuthorNameChange: (name: string) => void;
  onGenerateCover: () => void;
  onCoverUploaded?: (publicUrl: string) => void;
  onSaveToLibrary: () => void;
  onStartReading: () => void;
}

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

export function BookDetailHeader({
  book, chapters, readingTime, isSaved, isOwner,
  coverTheme, coverAuthorName, isGeneratingCover,
  onCoverThemeChange, onCoverAuthorNameChange, onGenerateCover, onCoverUploaded,
  onSaveToLibrary, onStartReading,
}: BookDetailHeaderProps) {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12"
    >
      {/* Cover */}
      <div className="lg:col-span-1">
        <div className="aspect-[3/4] relative rounded-xl overflow-hidden bg-gradient-to-br from-secondary to-secondary border border-border/50 shadow-card group">
          {book.cover_image_url ? (
            <img src={book.cover_image_url} alt={`${book.title} book cover`} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
              <Book className="h-24 w-24 text-primary/30" />
              <p className="text-sm text-muted-foreground text-center">No cover yet</p>
            </div>
          )}
          {isOwner && (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-background/70 backdrop-blur-sm border-t border-border/50">
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={coverAuthorName}
                  onChange={(e) => onCoverAuthorNameChange(e.target.value)}
                  placeholder={book.author_ai_agent || "Author name for cover"}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Select value={coverTheme} onValueChange={onCoverThemeChange}>
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
                <Button variant="gold-outline" size="sm" onClick={onGenerateCover} disabled={isGeneratingCover}>
                  {isGeneratingCover ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('book.generating')}</>
                  ) : (
                    <><RefreshCw className="h-4 w-4 mr-2" />{book.cover_image_url ? t('book.regenerateCover') : t('book.generateCover')}</>
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
          <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-primary/20 text-primary border border-primary/30 capitalize">
            {book.category.replace(/_/g, " ")}
          </span>
          {isOwner && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full border ${
              book.is_published ? "bg-green-500/10 text-green-500 border-green-500/30" : "bg-muted/50 text-muted-foreground border-border"
            }`}>
              {book.is_published ? (<><Globe className="h-3.5 w-3.5" />{t('book.public')}</>) : (<><Lock className="h-3.5 w-3.5" />{t('book.private')}</>)}
            </span>
          )}
        </div>
        
        <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{book.title}</h1>
        <p className="text-muted-foreground text-lg leading-relaxed mb-6">{stripMarkdownInline(book.description || t('book.defaultDesc'))}</p>

        <div className="flex flex-wrap gap-6 mb-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /><span>{book.author_ai_agent || "ScrollAuthorGPT"}</span></div>
          <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><span>{chapters.length || book.total_chapters} {t('book.chapters')}</span></div>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><span>{readingTime} {t('book.minRead')}</span></div>
          {chapters.some(ch => ch.is_generated) && <CodeQualityBadge chapters={chapters} />}
        </div>

        <div className="flex flex-wrap gap-4">
          <Button variant="hero" size="lg" onClick={onStartReading} disabled={chapters.length === 0 || !chapters.some(ch => ch.is_generated)}>
            <Play className="h-5 w-5 mr-2" />{t('book.startReading')}
          </Button>
          <Button variant="gold-outline" size="lg" onClick={onSaveToLibrary}>
            <Bookmark className={`h-5 w-5 mr-2 ${isSaved ? "fill-current" : ""}`} />{isSaved ? t('book.saved') : t('book.saveToLibrary')}
          </Button>
          <ExportDialog
            bookId={book.id} title={book.title}
            hasGeneratedChapters={chapters.some(ch => ch.is_generated)}
            coverImageUrl={book.cover_image_url} authorName={book.author_ai_agent || undefined}
            bookType={book.book_type || 'text'}
            chapterContents={chapters.filter(ch => ch.is_generated).map(ch => ch.content || '')}
            chapters={chapters.filter(ch => ch.is_generated).map(ch => ({ chapter_number: ch.chapter_number, content: ch.content }))}
          />
          <ShareDialog title={book.title} bookId={book.id} description={book.description || undefined} />
          <CollaborationPanel bookId={book.id} userId={book.user_id} />
          <ReportContentDialog contentType="book" contentId={book.id} contentTitle={book.title} />
        </div>
      </div>
    </motion.div>
  );
}
