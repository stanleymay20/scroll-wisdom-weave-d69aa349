/**
 * CONTRACT 2 — ChapterEditor with Output Determinism
 * 
 * Enforces:
 * - Rule 1: User text is authoritative
 * - Rule 2: No silent regeneration
 * - Rule 3: Explicit edit instructions required
 * - Rule 4: Partial editing only
 * - Rule 6: User-authored content mode
 * - Rule 7: Change preview mandatory
 * - Rule 8: Fail loudly, not quietly
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Save, 
  RefreshCw, 
  Loader2, 
  AlertTriangle,
  Lock,
  Unlock,
  Shield
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PasteProtectionDialog } from "@/components/system/PasteProtectionDialog";
import { EditScopeDialog } from "@/components/system/EditScopeDialog";
import { ChangePreviewDialog } from "@/components/system/ChangePreviewDialog";
import { 
  checkRegenerationGuard,
  detectContentOwnership,
  verifyContentIntegrity,
  logContractViolation,
  type EditScope,
  type ContentOwnershipState,
} from "@/lib/contentDeterminism";

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
  
  // Contract 2 Dialogs
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [showEditScopeDialog, setShowEditScopeDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  
  const [pendingPasteContent, setPendingPasteContent] = useState<string | null>(null);
  const [pendingEditScope, setPendingEditScope] = useState<EditScope | null>(null);
  const [proposedContent, setProposedContent] = useState<string>('');
  
  // Content ownership tracking
  const [ownership, setOwnership] = useState<ContentOwnershipState>({
    isUserAuthored: false,
    isAIGenerated: true,
    isHybrid: false,
    userLocked: false,
    differencePercentage: 0,
    lastAIContent: null,
    lastSavedContent: content,
    lockedAt: null,
  });
  
  const lastSavedContent = useRef(content);
  const hasAskedForPaste = useRef(false);

  // Initialize content and ownership state
  useEffect(() => {
    setLocalContent(content);
    lastSavedContent.current = content;
    hasAskedForPaste.current = false;
  }, [content]);

  // Load ownership state from database
  useEffect(() => {
    const loadOwnership = async () => {
      const { data } = await supabase
        .from("chapters")
        .select("user_locked, last_ai_content, content_ownership")
        .eq("id", chapterId)
        .single();
      
      if (data) {
        const ownershipData = data.content_ownership as Record<string, unknown> | null;
        const newOwnership = detectContentOwnership(
          content,
          data.last_ai_content,
          data.user_locked || false
        );
        
        setOwnership({
          ...newOwnership,
          differencePercentage: ownershipData?.differencePercentage as number ?? newOwnership.differencePercentage,
        });
      }
    };
    loadOwnership();
  }, [chapterId, content]);

  // Calculate content difference
  const calculateDifference = useCallback((original: string, modified: string): number => {
    if (!original || !modified) return 100;
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const modifiedWords = new Set(modified.toLowerCase().split(/\s+/));
    const intersection = [...originalWords].filter(w => modifiedWords.has(w)).length;
    const union = new Set([...originalWords, ...modifiedWords]).size;
    return union > 0 ? Math.round((1 - intersection / union) * 100) : 0;
  }, []);

  // Handle paste event - CONTRACT 2 Rule 1
  // If user is pasting significant content, show dialog to decide if it should be protected
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // If already asked or already locked, just allow the paste - content is protected
    if (hasAskedForPaste.current) return;
    
    // If content is already locked (user-authored), allow paste without dialog
    // The content is already protected
    if (ownership.userLocked) return;
    
    const pastedText = e.clipboardData.getData('text');
    // Only show dialog for substantial pastes (50+ chars)
    if (!pastedText || pastedText.length < 50) return;
    
    const textArea = e.target as HTMLTextAreaElement;
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const newContent = localContent.slice(0, start) + pastedText + localContent.slice(end);
    
    const diffPercent = calculateDifference(lastSavedContent.current, newContent);
    
    // For significant changes (>30%), show the protection dialog
    if (diffPercent > 30) {
      e.preventDefault();
      setPendingPasteContent(newContent);
      setShowPasteDialog(true);
    }
  }, [localContent, calculateDifference, ownership.userLocked]);

  // Handle paste protection dialog result
  // CRITICAL: Always apply the pasted content - never discard user's paste
  const handlePasteResult = useCallback(async (result: { action: 'lock' | 'allow_regen' | 'cancel' }) => {
    hasAskedForPaste.current = true;
    setShowPasteDialog(false);
    
    // IMPORTANT: Even on cancel, we should apply the paste! The dialog asks about PROTECTION, not whether to paste.
    // The user's paste should NEVER be discarded - that violates Contract 2 Rule 1: User text is authoritative
    if (pendingPasteContent) {
      setLocalContent(pendingPasteContent);
    }
    
    // Cancel means "just paste without deciding on lock status now"
    if (result.action === 'cancel') {
      setPendingPasteContent(null);
      toast({
        title: "Content pasted",
        description: "Your content has been added. Save when ready.",
      });
      return;
    }
    
    const shouldLock = result.action === 'lock';
    
    try {
      await supabase
        .from("chapters")
        .update({ 
          user_locked: shouldLock,
          content_ownership: {
            isUserAuthored: shouldLock,
            isAIGenerated: !shouldLock,
            isHybrid: false,
            lockedAt: shouldLock ? new Date().toISOString() : null,
          },
        })
        .eq("id", chapterId);
      
      setOwnership(prev => ({
        ...prev,
        userLocked: shouldLock,
        isUserAuthored: shouldLock,
        isAIGenerated: !shouldLock,
      }));
      
      toast({
        title: shouldLock ? "Content protected" : "Content pasted",
        description: shouldLock 
          ? "Your writing is protected. Save to persist your changes."
          : "Content added. This content can be edited with AI.",
      });
    } catch (error) {
      console.error("Error updating lock status:", error);
      logContractViolation('Failed to update content lock status', { error, chapterId });
    }
    
    setPendingPasteContent(null);
  }, [chapterId, pendingPasteContent, toast]);

  // Save Draft (No AI) - CONTRACT 2 Rule 2: No silent regeneration
  const handleSaveDraft = async () => {
    setIsSaving(true);
    const contentBefore = lastSavedContent.current;
    
    try {
      const wordCount = localContent.split(/\s+/).filter(w => w.length > 0).length;
      const diffPercent = calculateDifference(contentBefore, localContent);
      
      const { error } = await supabase
        .from("chapters")
        .update({
          content: localContent,
          word_count: wordCount,
          updated_at: new Date().toISOString(),
          user_locked: diffPercent > 30 || ownership.userLocked,
        })
        .eq("id", chapterId);

      if (error) throw error;

      // Verify content integrity - CONTRACT 2 Rule 8
      const { data: savedChapter } = await supabase
        .from("chapters")
        .select("content")
        .eq("id", chapterId)
        .single();
      
      if (savedChapter) {
        const integrity = verifyContentIntegrity(localContent, savedChapter.content || '', true);
        if (!integrity.intact) {
          logContractViolation('Content modified unexpectedly during save', { 
            chapterId, 
            error: integrity.error 
          });
          throw new Error(integrity.error);
        }
      }

      lastSavedContent.current = localContent;
      
      if (diffPercent > 30) {
        setOwnership(prev => ({
          ...prev,
          userLocked: true,
          isUserAuthored: true,
          differencePercentage: diffPercent,
        }));
      }
      
      onContentChange(localContent);
      onSave();
      
      toast({
        title: "Draft saved",
        description: "Your changes have been saved. No AI modifications applied.",
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

  // Handle regeneration request - CONTRACT 2 Rules 2, 3, 7
  const handleRegenerateClick = () => {
    // Check regeneration guard first
    const guard = checkRegenerationGuard(ownership, null, 'user_action');
    
    if (!guard.allowed && guard.requiresScope) {
      // Show edit scope dialog
      setShowEditScopeDialog(true);
    } else if (!guard.allowed) {
      toast({
        title: "Regeneration blocked",
        description: guard.reason,
        variant: "destructive",
      });
    }
  };

  // Handle edit scope confirmation - CONTRACT 2 Rule 3
  const handleEditScopeConfirm = async (scope: EditScope) => {
    setPendingEditScope(scope);
    setIsRegenerating(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Generate with explicit scope
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
          editIntent: scope.description,
          editType: scope.type,
          targetSection: scope.targetText,
          isRegeneration: true,
          preserveUserContent: ownership.userLocked,
        },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      // Fetch proposed content for preview - CONTRACT 2 Rule 7
      const { data: updatedChapter } = await supabase
        .from("chapters")
        .select("content")
        .eq("id", chapterId)
        .single();

      if (updatedChapter?.content) {
        setProposedContent(updatedChapter.content);
        setShowPreviewDialog(true);
      }
    } catch (error) {
      console.error("Regeneration error:", error);
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Could not regenerate chapter",
        variant: "destructive",
      });
      setIsRegenerating(false);
    }
  };

  // Handle preview confirmation - CONTRACT 2 Rule 7
  const handlePreviewResult = async (result: { confirmed: boolean }) => {
    setShowPreviewDialog(false);
    
    if (result.confirmed) {
      setLocalContent(proposedContent);
      lastSavedContent.current = proposedContent;
      onContentChange(proposedContent);
      
      // Save the last AI content for future comparison
      await supabase
        .from("chapters")
        .update({ last_ai_content: proposedContent })
        .eq("id", chapterId);
      
      toast({
        title: "Changes applied",
        description: `Edit applied: "${pendingEditScope?.description.slice(0, 40)}..."`,
      });
    } else {
      // Revert to previous content
      await supabase
        .from("chapters")
        .update({ content: lastSavedContent.current })
        .eq("id", chapterId);
      
      toast({
        title: "Changes cancelled",
        description: "Content restored to previous version.",
      });
    }
    
    setIsRegenerating(false);
    setPendingEditScope(null);
    setProposedContent('');
  };

  // Toggle lock status
  const handleToggleLock = async () => {
    try {
      const newLocked = !ownership.userLocked;
      
      const { error } = await supabase
        .from("chapters")
        .update({ user_locked: newLocked })
        .eq("id", chapterId);

      if (error) throw error;

      setOwnership(prev => ({ ...prev, userLocked: newLocked }));
      
      toast({
        title: newLocked ? "Chapter protected" : "Chapter unlocked",
        description: newLocked 
          ? "Your content is now protected from full regeneration."
          : "This chapter can now be fully regenerated.",
      });
    } catch (error) {
      console.error("Lock toggle error:", error);
    }
  };

  const hasChanges = localContent !== lastSavedContent.current;
  const diffPercent = calculateDifference(lastSavedContent.current, localContent);

  return (
    <div className="space-y-4">
      {/* Contract 2 Status bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleLock}
            className={ownership.userLocked ? "text-amber-500" : "text-muted-foreground"}
          >
            {ownership.userLocked ? (
              <>
                <Lock className="h-4 w-4 mr-1" />
                Protected
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 mr-1" />
                Unlocked
              </>
            )}
          </Button>
          
          {ownership.isUserAuthored && (
            <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-1 rounded flex items-center gap-1">
              <Shield className="h-3 w-3" />
              User-Authored
            </span>
          )}
          
          {hasChanges && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              Unsaved ({diffPercent}% different)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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
                Save (No AI)
              </>
            )}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleRegenerateClick}
            disabled={isRegenerating || !isGenerated}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Edit With AI
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <Textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        onPaste={handlePaste}
        className="min-h-[400px] font-mono text-sm bg-background/50"
        placeholder="Chapter content..."
      />

      {/* Contract 2 Info */}
      <p className="text-xs text-muted-foreground">
        <strong>Save (No AI)</strong> preserves your exact text without any AI modifications.
        <strong> Edit With AI</strong> requires you to specify exactly what changes you want before preview and confirmation.
      </p>

      {/* CONTRACT 2 Dialogs */}
      <PasteProtectionDialog
        open={showPasteDialog}
        onResult={handlePasteResult}
        contentPreview={pendingPasteContent?.slice(0, 200)}
      />

      <EditScopeDialog
        open={showEditScopeDialog}
        onOpenChange={setShowEditScopeDialog}
        onConfirm={handleEditScopeConfirm}
        isUserLocked={ownership.userLocked}
        differencePercentage={ownership.differencePercentage}
        chapterTitle={chapterTitle}
      />

      <ChangePreviewDialog
        open={showPreviewDialog}
        onResult={handlePreviewResult}
        originalContent={lastSavedContent.current}
        proposedContent={proposedContent}
        editDescription={pendingEditScope?.description || ''}
        chapterTitle={chapterTitle}
      />
    </div>
  );
}
