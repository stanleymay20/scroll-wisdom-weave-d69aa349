import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Book, 
  MoreVertical, 
  Trash2, 
  BookOpen, 
  Share2, 
  Download,
  Eye,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface LibraryBookCardProps {
  libraryId: string;
  bookId: string;
  title: string;
  description?: string | null;
  category: string;
  coverImageUrl?: string | null;
  totalChapters?: number | null;
  progressPercent?: number | null;
  lastReadChapter?: number | null;
  onRemove?: (libraryId: string) => void;
  index?: number;
}

export function LibraryBookCard({
  libraryId,
  bookId,
  title,
  description,
  category,
  coverImageUrl,
  totalChapters = 0,
  progressPercent = 0,
  lastReadChapter = 1,
  onRemove,
  index = 0,
}: LibraryBookCardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  const categoryFormatted = category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  const progress = progressPercent || 0;
  const isComplete = progress >= 100;
  const isStarted = progress > 0;

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from("user_library")
        .delete()
        .eq("id", libraryId);

      if (error) throw error;

      toast({
        title: t('library.bookRemoved') || "Book removed",
        description: t('library.bookRemovedDesc') || "The book has been removed from your library",
      });

      onRemove?.(libraryId);
    } catch (error) {
      console.error("Error removing from library:", error);
      toast({
        title: t('common.error') || "Error",
        description: t('library.removeError') || "Failed to remove book from library",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
      setShowRemoveDialog(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title,
        text: description || `Check out "${title}" on ScrollLibrary`,
        url: `${window.location.origin}/book/${bookId}`,
      });
    } catch {
      // Fallback to clipboard
      await navigator.clipboard.writeText(`${window.location.origin}/book/${bookId}`);
      toast({
        title: t('book.linkCopied') || "Link copied",
        description: t('book.linkCopiedDesc') || "Book link copied to clipboard",
      });
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.3, ease: "easeOut" }}
        className="h-full"
      >
        <div className="relative h-full bg-gradient-card rounded-xl overflow-hidden border border-border/50 book-card-hover shadow-card flex flex-col group">
          {/* Dropdown Menu - Always visible */}
          <div className="absolute top-2 right-2 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="bg-background/80 backdrop-blur-md hover:bg-background shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  onClick={(e) => e.preventDefault()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to={`/book/${bookId}`} className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    {t('common.viewDetails') || "View Details"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link 
                    to={`/read/${bookId}/${lastReadChapter || 1}`} 
                    className="flex items-center gap-2"
                  >
                    <BookOpen className="h-4 w-4" />
                    {isStarted 
                      ? (t('library.continueReading') || "Continue Reading") 
                      : (t('library.startReading') || "Start Reading")
                    }
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  <Share2 className="h-4 w-4 mr-2" />
                  {t('common.share') || "Share"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setShowRemoveDialog(true)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('library.removeFromLibrary') || "Remove from Library"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Book Cover */}
          <Link to={`/book/${bookId}`} className="block">
            <div className="aspect-[3/4] relative overflow-hidden flex-shrink-0">
              {coverImageUrl ? (
                <img
                  src={coverImageUrl}
                  alt={title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                  <Book className="h-16 w-16 text-primary/20" />
                </div>
              )}
              
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
              
              {/* Category badge */}
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-background/80 text-foreground backdrop-blur-md border border-border/50 shadow-sm">
                  {categoryFormatted}
                </span>
              </div>

              {/* Status badge */}
              {isComplete && (
                <div className="absolute bottom-3 left-3 z-10">
                  <Badge variant="default" className="bg-green-500/90 hover:bg-green-500">
                    {t('library.completed') || "Completed"}
                  </Badge>
                </div>
              )}
            </div>
          </Link>

          {/* Book Info */}
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <Link to={`/book/${bookId}`}>
              <h3 className="font-display text-base font-semibold line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
                {title}
              </h3>
            </Link>
            
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                {description}
              </p>
            )}

            {/* Progress Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lastReadChapter && totalChapters 
                    ? `Ch. ${lastReadChapter} / ${totalChapters}`
                    : `${totalChapters} Chapters`
                  }
                </span>
                <span className="font-medium text-primary">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>

            {/* Action Button */}
            <div className="pt-2 mt-auto">
              <Button 
                variant={isComplete ? "outline" : "default"} 
                size="sm" 
                className="w-full" 
                asChild
              >
                <Link to={`/read/${bookId}/${lastReadChapter || 1}`}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {isComplete 
                    ? (t('library.readAgain') || "Read Again")
                    : isStarted 
                      ? (t('library.continue') || "Continue")
                      : (t('library.startReading') || "Start Reading")
                  }
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('library.removeBookTitle') || "Remove from Library?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('library.removeBookDesc') || `Are you sure you want to remove "${title}" from your library? Your reading progress will be lost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>
              {t('common.cancel') || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  {t('common.removing') || "Removing..."}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.remove') || "Remove"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
