import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Save, 
  RefreshCw, 
  Loader2, 
  Check,
  AlertTriangle,
  Lock,
  Unlock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ChapterEditorProps {
  chapterId: string;
  content: string;
  chapterTitle: string;
  bookTitle: string;
  chapterNumber: number;
  category: string;
  language: string;
  bookType: string;
  isGenerated: boolean;
  onContentChange: (content: string) => void;
  onSave: () => void;
}

export function ChapterEditor({
  chapterId,
  content,
  chapterTitle,
  bookTitle,
  chapterNumber,
  category,
  language,
  bookType,
  isGenerated,
  onContentChange,
  onSave,
}: ChapterEditorProps) {
  const { toast } = useToast();
  const [localContent, setLocalContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [editIntent, setEditIntent] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(content);

  useEffect(() => {
    setLocalContent(content);
    setLastSavedContent(content);
  }, [content]);

  // Check if chapter is locked
  useEffect(() => {
    const checkLocked = async () => {
      const { data } = await supabase
        .from("chapters")
        .select("user_locked")
        .eq("id", chapterId)
        .single();
      
      if (data) {
        setIsLocked(data.user_locked || false);
      }
    };
    checkLocked();
  }, [chapterId]);

  // Calculate content difference percentage
  const calculateDifference = useCallback((original: string, modified: string): number => {
    if (!original || !modified) return 100;
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const modifiedWords = new Set(modified.toLowerCase().split(/\s+/));
    const intersection = [...originalWords].filter(w => modifiedWords.has(w)).length;
    const union = new Set([...originalWords, ...modifiedWords]).size;
    return union > 0 ? Math.round((1 - intersection / union) * 100) : 0;
  }, []);

  // Save Draft (No AI) - saves directly without regeneration
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const wordCount = localContent.split(/\s+/).filter(w => w.length > 0).length;
      
      const { error } = await supabase
        .from("chapters")
        .update({
          content: localContent,
          word_count: wordCount,
          updated_at: new Date().toISOString(),
          // Mark as user-modified if content differs significantly
          user_locked: calculateDifference(lastSavedContent, localContent) > 30,
        })
        .eq("id", chapterId);

      if (error) throw error;

      setLastSavedContent(localContent);
      onContentChange(localContent);
      onSave();
      
      toast({
        title: "Draft saved",
        description: "Your changes have been saved without regeneration.",
      });
    } catch (error) {
      console.error("Save error:", error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save draft",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Regenerate With Instructions - requires edit intent
  const handleRegenerate = async () => {
    if (!editIntent.trim()) {
      toast({
        title: "Edit intent required",
        description: "Please describe what changes you want to make.",
        variant: "destructive",
      });
      return;
    }

    setIsRegenerating(true);
    setShowRegenDialog(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("generate-chapter", {
        body: {
          chapterId,
          bookTitle,
          chapterTitle,
          chapterNumber,
          keyTopics: [],
          category,
          language,
          bookType,
          editIntent: editIntent.trim(),
          isRegeneration: true,
        },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      // Fetch updated content
      const { data: updatedChapter } = await supabase
        .from("chapters")
        .select("content")
        .eq("id", chapterId)
        .single();

      if (updatedChapter?.content) {
        setLocalContent(updatedChapter.content);
        setLastSavedContent(updatedChapter.content);
        onContentChange(updatedChapter.content);
      }

      toast({
        title: "Chapter regenerated",
        description: `Applied edit: "${editIntent.slice(0, 50)}..."`,
      });
      
      setEditIntent("");
    } catch (error) {
      console.error("Regeneration error:", error);
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Could not regenerate chapter",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Toggle lock status
  const handleToggleLock = async () => {
    try {
      const { error } = await supabase
        .from("chapters")
        .update({ user_locked: !isLocked })
        .eq("id", chapterId);

      if (error) throw error;

      setIsLocked(!isLocked);
      toast({
        title: isLocked ? "Chapter unlocked" : "Chapter locked",
        description: isLocked 
          ? "This chapter can now be fully regenerated."
          : "This chapter is now protected from full regeneration.",
      });
    } catch (error) {
      console.error("Lock toggle error:", error);
    }
  };

  const hasChanges = localContent !== lastSavedContent;
  const diffPercent = calculateDifference(lastSavedContent, localContent);

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleLock}
            className={isLocked ? "text-amber-500" : "text-muted-foreground"}
          >
            {isLocked ? (
              <>
                <Lock className="h-4 w-4 mr-1" />
                Locked (Protected)
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 mr-1" />
                Unlocked
              </>
            )}
          </Button>
          
          {hasChanges && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              Unsaved changes ({diffPercent}% different)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Save Draft Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Save Draft (No AI)
              </>
            )}
          </Button>

          {/* Regenerate Button */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowRegenDialog(true)}
            disabled={isRegenerating || !isGenerated}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate With Instructions
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <Textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        className="min-h-[400px] font-mono text-sm bg-background/50"
        placeholder="Chapter content..."
      />

      {/* Info */}
      <p className="text-xs text-muted-foreground">
        <strong>Save Draft</strong> saves your changes directly without AI regeneration.
        <strong> Regenerate With Instructions</strong> uses AI to apply specific edits while preserving your structure.
      </p>

      {/* Regenerate Dialog */}
      <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate With Instructions</DialogTitle>
            <DialogDescription>
              Describe what you want to change. The AI will apply your edits while preserving the chapter structure.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Edit Instruction (Required)</Label>
              <Input
                value={editIntent}
                onChange={(e) => setEditIntent(e.target.value)}
                placeholder="e.g., Make the tone more academic, add more examples..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Quick options:</span>
              {["Shorten by 20%", "Make more academic", "Add examples", "Fix formatting", "Improve clarity"].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setEditIntent(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>

            {isLocked && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  This chapter is locked. Regeneration will apply targeted edits only, preserving your modifications.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={!editIntent.trim()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
