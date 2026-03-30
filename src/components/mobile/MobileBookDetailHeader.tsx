/**
 * Mobile Book Detail Header
 * 
 * Optimized header for mobile book detail pages with:
 * - Compact cover display
 * - Sticky actions
 * - Better touch targets
 */

import { memo } from "react";
import { stripMarkdownInline } from "@/lib/stripMarkdownInline";
import { motion } from "framer-motion";
import { 
  Book, 
  Bookmark, 
  Play, 
  Share2, 
  Clock,
  BookOpen,
  Globe,
  Lock,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileBookDetailHeaderProps {
  book: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    author_ai_agent: string | null;
    cover_image_url: string | null;
    is_published: boolean | null;
    language: string | null;
  };
  chaptersCount: number;
  readingTime: number;
  isSaved: boolean;
  isOwner: boolean;
  hasGeneratedChapters: boolean;
  onSave: () => void;
  onStartReading: () => void;
  onShare: () => void;
  className?: string;
}

export const MobileBookDetailHeader = memo(function MobileBookDetailHeader({
  book,
  chaptersCount,
  readingTime,
  isSaved,
  isOwner,
  hasGeneratedChapters,
  onSave,
  onStartReading,
  onShare,
  className,
}: MobileBookDetailHeaderProps) {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("px-4 pt-4", className)}
    >
      {/* Cover + Info Row */}
      <div className="flex gap-4">
        {/* Cover */}
        <div className="w-28 h-40 flex-shrink-0 rounded-xl overflow-hidden bg-muted shadow-lg border border-border/50">
          {book.cover_image_url ? (
            <img
              src={book.cover_image_url}
              alt={book.title}
              className="w-full h-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <Book className="h-10 w-10 text-primary/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          {/* Category + Visibility */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-scroll-gold/20 text-scroll-gold border border-scroll-gold/30 capitalize">
              {book.category.replace(/_/g, " ")}
            </span>
            {isOwner && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border",
                book.is_published 
                  ? "bg-green-500/10 text-green-500 border-green-500/30" 
                  : "bg-muted/50 text-muted-foreground border-border"
              )}>
                {book.is_published ? (
                  <>
                    <Globe className="h-2.5 w-2.5" />
                    Public
                  </>
                ) : (
                  <>
                    <Lock className="h-2.5 w-2.5" />
                    Private
                  </>
                )}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="font-display text-lg font-bold text-foreground leading-tight line-clamp-2 mt-2">
            {book.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 text-scroll-gold" />
              {book.author_ai_agent || "ScrollAuthorGPT"}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-scroll-gold" />
              {chaptersCount} ch
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-scroll-gold" />
              {readingTime} min
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {book.description && (
        <p className="text-sm text-muted-foreground mt-4 line-clamp-3">
          {stripMarkdownInline(book.description)}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        <Button 
          variant="hero" 
          className="flex-1 h-11"
          onClick={onStartReading}
          disabled={!hasGeneratedChapters}
        >
          <Play className="h-4 w-4 mr-2" />
          {t('book.startReading')}
        </Button>
        <Button 
          variant="gold-outline" 
          size="icon"
          className="h-11 w-11"
          onClick={onSave}
        >
          <Bookmark className={cn("h-5 w-5", isSaved && "fill-current")} />
        </Button>
        <Button 
          variant="outline" 
          size="icon"
          className="h-11 w-11"
          onClick={onShare}
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
});
