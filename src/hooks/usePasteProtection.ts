import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UsePasteProtectionOptions {
  chapterId: string;
  onContentLocked?: () => void;
}

interface PasteProtectionState {
  showDialog: boolean;
  pendingContent: string | null;
  isLocked: boolean;
}

export function usePasteProtection({ chapterId, onContentLocked }: UsePasteProtectionOptions) {
  const [state, setState] = useState<PasteProtectionState>({
    showDialog: false,
    pendingContent: null,
    isLocked: false,
  });
  
  const lastSavedContent = useRef<string>("");
  const hasAskedForThisEdit = useRef(false);

  // Check if chapter is locked
  const checkLockStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("chapters")
        .select("user_locked, content")
        .eq("id", chapterId)
        .single();
      
      if (data) {
        setState(prev => ({ ...prev, isLocked: data.user_locked || false }));
        lastSavedContent.current = data.content || "";
      }
    } catch (error) {
      console.error("Error checking lock status:", error);
    }
  }, [chapterId]);

  // Called when user makes significant edits (paste, major typing)
  const handleContentChange = useCallback((
    newContent: string,
    triggeredBy: 'paste' | 'type' | 'blur'
  ) => {
    // Skip if already locked or if we already asked for this edit session
    if (state.isLocked || hasAskedForThisEdit.current) {
      return { shouldProceed: true, needsDialog: false };
    }

    // Calculate difference from last saved content
    const oldWords = new Set(lastSavedContent.current.toLowerCase().split(/\s+/));
    const newWords = new Set(newContent.toLowerCase().split(/\s+/));
    
    const totalWords = Math.max(oldWords.size, newWords.size, 1);
    const commonWords = [...oldWords].filter(w => newWords.has(w)).length;
    const differencePercent = Math.round((1 - commonWords / totalWords) * 100);

    // Only show dialog for significant changes (>30% different) on paste
    if (triggeredBy === 'paste' && differencePercent > 30) {
      setState(prev => ({
        ...prev,
        showDialog: true,
        pendingContent: newContent,
      }));
      return { shouldProceed: false, needsDialog: true };
    }

    return { shouldProceed: true, needsDialog: false };
  }, [state.isLocked]);

  // Handle dialog result
  const handleDialogResult = useCallback(async (result: { action: 'lock' | 'allow_regen' | 'cancel' }) => {
    hasAskedForThisEdit.current = true;
    
    if (result.action === 'cancel') {
      setState(prev => ({ ...prev, showDialog: false, pendingContent: null }));
      return { proceed: false, content: null };
    }

    const shouldLock = result.action === 'lock';
    
    try {
      // Update chapter lock status
      const { error } = await supabase
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

      if (error) throw error;

      setState(prev => ({
        ...prev,
        showDialog: false,
        isLocked: shouldLock,
        pendingContent: null,
      }));

      if (shouldLock) {
        toast.success("Chapter locked as your writing", {
          description: "Full regeneration is now disabled for this chapter.",
        });
        onContentLocked?.();
      } else {
        toast.info("Chapter remains unlocked", {
          description: "This content can be regenerated.",
        });
      }

      return { proceed: true, content: state.pendingContent };
    } catch (error) {
      console.error("Error updating lock status:", error);
      toast.error("Failed to update chapter status");
      return { proceed: false, content: null };
    }
  }, [chapterId, state.pendingContent, onContentLocked]);

  // Reset the "asked" flag when switching chapters or on new edits
  const resetAskFlag = useCallback(() => {
    hasAskedForThisEdit.current = false;
  }, []);

  return {
    showDialog: state.showDialog,
    pendingContent: state.pendingContent,
    isLocked: state.isLocked,
    checkLockStatus,
    handleContentChange,
    handleDialogResult,
    resetAskFlag,
  };
}
