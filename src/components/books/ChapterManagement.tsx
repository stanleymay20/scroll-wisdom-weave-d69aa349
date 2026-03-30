/**
 * Chapter Management Component
 * 
 * Allows book owners to:
 * - Add new chapters
 * - Remove chapters  
 * - Add/edit preface
 * - Reorder chapters (future)
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  FileText, 
  Loader2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
  is_generated: boolean | null;
  content: string | null;
}

interface ChapterManagementProps {
  bookId: string;
  bookTitle: string;
  chapters: ChapterData[];
  onChaptersChange: (chapters: ChapterData[]) => void;
  onBookUpdate?: (updates: { preface?: string }) => void;
  preface?: string | null;
  className?: string;
}

export function ChapterManagement({
  bookId,
  bookTitle,
  chapters,
  onChaptersChange,
  onBookUpdate,
  preface,
  className,
}: ChapterManagementProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  
  // State
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<ChapterData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [prefaceOpen, setPrefaceOpen] = useState(false);
  const [prefaceContent, setPrefaceContent] = useState(preface || "");
  const [isSavingPreface, setIsSavingPreface] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Add new chapter
  const handleAddChapter = async () => {
    if (!newChapterTitle.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a chapter title",
        variant: "destructive",
      });
      return;
    }

    setIsAddingChapter(true);
    
    try {
      const nextChapterNumber = chapters.length + 1;
      
      const { data, error } = await supabase
        .from("chapters")
        .insert({
          book_id: bookId,
          chapter_number: nextChapterNumber,
          title: newChapterTitle.trim(),
          is_generated: false,
          content: `### Key Topics\n- Topic 1\n- Topic 2\n\n*Full chapter content will be generated*`,
        })
        .select()
        .single();

      if (error) throw error;

      // Update book total_chapters
      await supabase
        .from("books")
        .update({ total_chapters: nextChapterNumber })
        .eq("id", bookId);

      // Update local state
      onChaptersChange([...chapters, {
        id: data.id,
        chapter_number: nextChapterNumber,
        title: data.title,
        word_count: null,
        is_generated: false,
        content: data.content,
      }]);

      toast({
        title: "Chapter added",
        description: `"${newChapterTitle}" has been added to the book.`,
      });

      setNewChapterTitle("");
      setAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding chapter:", error);
      toast({
        title: "Failed to add chapter",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAddingChapter(false);
    }
  };

  // Delete chapter
  const handleDeleteChapter = async () => {
    if (!chapterToDelete) return;

    setIsDeleting(true);
    
    try {
      const { error } = await supabase
        .from("chapters")
        .delete()
        .eq("id", chapterToDelete.id);

      if (error) throw error;

      // Re-number remaining chapters
      const remainingChapters = chapters
        .filter(ch => ch.id !== chapterToDelete.id)
        .map((ch, index) => ({ ...ch, chapter_number: index + 1 }));

      // Update chapter numbers in database
      for (const ch of remainingChapters) {
        await supabase
          .from("chapters")
          .update({ chapter_number: ch.chapter_number })
          .eq("id", ch.id);
      }

      // Update book total_chapters
      await supabase
        .from("books")
        .update({ total_chapters: remainingChapters.length })
        .eq("id", bookId);

      onChaptersChange(remainingChapters);

      toast({
        title: "Chapter deleted",
        description: `"${chapterToDelete.title}" has been removed.`,
      });
    } catch (error) {
      console.error("Error deleting chapter:", error);
      toast({
        title: "Failed to delete chapter",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setChapterToDelete(null);
    }
  };

  // Save preface
  const handleSavePreface = async () => {
    setIsSavingPreface(true);
    
    try {
      const { error } = await supabase
        .from("books")
        .update({ description: prefaceContent.trim() || null })
        .eq("id", bookId);

      if (error) throw error;

      onBookUpdate?.({ preface: prefaceContent.trim() });

      toast({
        title: "Preface saved",
        description: "Your book's preface has been updated.",
      });

      setPrefaceOpen(false);
    } catch (error) {
      console.error("Error saving preface:", error);
      toast({
        title: "Failed to save preface",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPreface(false);
    }
  };

  const openDeleteDialog = (chapter: ChapterData) => {
    setChapterToDelete(chapter);
    setDeleteDialogOpen(true);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Collapsible Chapter Management Section */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Manage Chapters & Preface</span>
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="space-y-4 pt-4">
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {/* Preface Section */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Preface / Introduction</Label>
                  </div>
                  <Dialog open={prefaceOpen} onOpenChange={setPrefaceOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-primary hover:text-primary-light">
                        {preface ? "Edit Preface" : "Add Preface"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Book Preface / Introduction</DialogTitle>
                        <DialogDescription>
                          Add a preface or introduction that appears before Chapter 1. This helps set context for your readers.
                        </DialogDescription>
                      </DialogHeader>
                      <Textarea
                        value={prefaceContent}
                        onChange={(e) => setPrefaceContent(e.target.value)}
                        placeholder="Write your preface here... This could include acknowledgments, author's notes, or an introduction to the book's themes."
                        className="min-h-[200px] resize-y"
                      />
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setPrefaceOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSavePreface}
                          disabled={isSavingPreface}
                          variant="hero"
                        >
                          {isSavingPreface ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save Preface"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {preface ? (
                  <p className="text-sm text-muted-foreground line-clamp-2">{preface}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No preface added yet</p>
                )}
              </div>

              {/* Chapter List with Delete Options */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span>Chapters ({chapters.length})</span>
                </Label>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {chapters.map((chapter) => (
                    <motion.div
                      key={chapter.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border/50 hover:border-border transition-colors group"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                      <span className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                        {chapter.chapter_number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{chapter.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {chapter.is_generated 
                            ? `${(chapter.word_count || 0).toLocaleString()} words` 
                            : "Not generated"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => openDeleteDialog(chapter)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Add Chapter Button */}
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-dashed gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add New Chapter
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Chapter</DialogTitle>
                    <DialogDescription>
                      Add a new chapter to "{bookTitle}". It will be added at the end of the book.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="chapter-title">Chapter Title</Label>
                      <Input
                        id="chapter-title"
                        value={newChapterTitle}
                        onChange={(e) => setNewChapterTitle(e.target.value)}
                        placeholder="e.g., Understanding Advanced Concepts"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isAddingChapter) {
                            handleAddChapter();
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        This will be Chapter {chapters.length + 1}
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddChapter}
                      disabled={isAddingChapter || !newChapterTitle.trim()}
                      variant="hero"
                    >
                      {isAddingChapter ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Chapter
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </motion.div>
          </AnimatePresence>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Chapter?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{chapterToDelete?.title}" and all its content.
              {chapterToDelete?.is_generated && (
                <span className="block mt-2 text-destructive">
                  ⚠️ This chapter has generated content that will be lost.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChapter}
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
                  Delete Chapter
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
