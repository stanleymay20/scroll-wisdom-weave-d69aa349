import { useState } from "react";
import { Loader2, Trash2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChapterManagement } from "@/components/books";
import { useLanguage } from "@/contexts/LanguageContext";

interface BookData {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean | null;
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

interface BookOwnerControlsProps {
  book: BookData;
  chapters: ChapterData[];
  isMobile: boolean;
  isUpdatingPublish: boolean;
  isDeleting: boolean;
  deleteDialogOpen: boolean;
  onTogglePublish: () => void;
  onUpdateBookType: (type: "text" | "illustrated" | "comic") => void;
  onArchive: () => void;
  onDelete: () => void;
  onDeleteDialogChange: (open: boolean) => void;
  onChaptersChange: (chapters: ChapterData[]) => void;
  onBookUpdate: (updates: { preface?: string }) => void;
}

export function BookOwnerControls({
  book, chapters, isMobile, isUpdatingPublish, isDeleting, deleteDialogOpen,
  onTogglePublish, onUpdateBookType, onArchive, onDelete, onDeleteDialogChange,
  onChaptersChange, onBookUpdate,
}: BookOwnerControlsProps) {
  const { t } = useLanguage();

  const idSuffix = isMobile ? "-mobile" : "";

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Book Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{book.title}" and all its chapters. This action cannot be undone.
              <br /><br /><strong>Note:</strong> All reading progress from other users will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>) : (<><Trash2 className="h-4 w-4 mr-2" />Delete Permanently</>)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chapter Management */}
      <ChapterManagement
        bookId={book.id}
        bookTitle={book.title}
        chapters={chapters}
        onChaptersChange={onChaptersChange}
        onBookUpdate={onBookUpdate}
        preface={book.description}
        className={isMobile ? "" : "mt-6"}
      />

      {/* Publish Toggle */}
      <div className={`flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50 ${isMobile ? "" : "mt-6"}`}>
        <div className="flex-1">
          <Label htmlFor={`publish-toggle${idSuffix}`} className="text-foreground font-medium">
            {t('book.publishToLibrary')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {book.is_published ? t('book.publicDesc') : t('book.privateDesc')}
          </p>
        </div>
        <Switch
          id={`publish-toggle${idSuffix}`}
          checked={book.is_published ?? false}
          onCheckedChange={onTogglePublish}
          disabled={isUpdatingPublish}
        />
      </div>

      {/* Book Type */}
      <div className="p-4 rounded-xl bg-muted/30 border border-border/50 mt-4">
        <Label className="text-foreground font-medium">{t('book.bookType')}</Label>
        <p className="text-sm text-muted-foreground mt-1">{t('book.bookTypeDesc')}</p>
        <RadioGroup
          value={(book.book_type || "text") as string}
          onValueChange={(v) => onUpdateBookType(v as "text" | "illustrated" | "comic")}
          className={`grid ${isMobile ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"} gap-3 mt-4`}
        >
          <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-primary/50 transition-colors">
            <RadioGroupItem value="text" id={`bt-text${idSuffix}`} />
            <Label htmlFor={`bt-text${idSuffix}`} className="cursor-pointer flex-1">
              <span className="text-sm font-medium">Text</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 rounded-lg border border-border/50 hover:border-primary/50 transition-colors">
            <RadioGroupItem value="illustrated" id={`bt-illustrated${idSuffix}`} />
            <Label htmlFor={`bt-illustrated${idSuffix}`} className="cursor-pointer flex-1">
              <span className="text-sm font-medium">{t('generate.illustrated')}</span>
              <span className="block text-xs text-muted-foreground">{t('book.textIllustrations')}</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Danger Zone */}
      <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 mt-4">
        <Label className="text-destructive font-medium">Danger Zone</Label>
        <p className="text-sm text-muted-foreground mt-1 mb-4">Irreversible actions for this book.</p>
        <div className={`flex ${isMobile ? "gap-3" : "flex-wrap gap-3"}`}>
          <Button variant="outline" size="sm" onClick={onArchive} disabled={!book.is_published} className={`text-muted-foreground hover:text-foreground ${isMobile ? "flex-1" : ""}`}>
            <Archive className="h-4 w-4 mr-2" />{isMobile ? "Archive" : "Archive Book"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDeleteDialogChange(true)} className={`text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive ${isMobile ? "flex-1" : ""}`}>
            <Trash2 className="h-4 w-4 mr-2" />{isMobile ? "Delete" : "Delete Book"}
          </Button>
        </div>
      </div>
    </>
  );
}
