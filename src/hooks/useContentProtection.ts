import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  detectContentOwnership, 
  ContentOwnership,
  calculateContentDifference 
} from "@/lib/systemDiagnostics";

interface ContentProtectionState {
  ownership: ContentOwnership | null;
  isLoading: boolean;
  lastAIContent: string | null;
}

export function useContentProtection(chapterId: string | undefined) {
  const [state, setState] = useState<ContentProtectionState>({
    ownership: null,
    isLoading: false,
    lastAIContent: null,
  });

  /**
   * Check content ownership status for a chapter
   */
  const checkOwnership = useCallback(async (currentContent: string): Promise<ContentOwnership> => {
    if (!chapterId) {
      return {
        isUserAuthored: false,
        isAIGenerated: true,
        isHybrid: false,
        userLocked: false,
        differencePercentage: 0,
      };
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Fetch the chapter's last AI content and user_locked status
      const { data: chapter, error } = await supabase
        .from('chapters')
        .select('last_ai_content, user_locked, content_ownership')
        .eq('id', chapterId)
        .single();

      if (error) throw error;

      const lastAIContent = chapter?.last_ai_content || null;
      const wasUserLocked = chapter?.user_locked || false;
      
      // Detect ownership based on content comparison
      const ownership = detectContentOwnership(
        currentContent,
        lastAIContent,
        wasUserLocked
      );

      setState({
        ownership,
        isLoading: false,
        lastAIContent,
      });

      return ownership;
    } catch (error) {
      console.error('Error checking content ownership:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      
      return {
        isUserAuthored: false,
        isAIGenerated: true,
        isHybrid: false,
        userLocked: false,
        differencePercentage: 0,
      };
    }
  }, [chapterId]);

  /**
   * Update content ownership and lock status in database
   */
  const updateOwnership = useCallback(async (
    currentContent: string,
    ownership: ContentOwnership
  ) => {
    if (!chapterId) return;

    try {
      await supabase
        .from('chapters')
        .update({
          user_locked: ownership.userLocked,
          content_ownership: ownership as any,
        })
        .eq('id', chapterId);
    } catch (error) {
      console.error('Error updating content ownership:', error);
    }
  }, [chapterId]);

  /**
   * Save AI-generated content for future comparison
   */
  const saveAIContent = useCallback(async (aiContent: string) => {
    if (!chapterId) return;

    try {
      await supabase
        .from('chapters')
        .update({
          last_ai_content: aiContent,
          user_locked: false,
          content_ownership: {
            isUserAuthored: false,
            isAIGenerated: true,
            isHybrid: false,
            differencePercentage: 0,
          } as any,
        })
        .eq('id', chapterId);

      setState(prev => ({ ...prev, lastAIContent: aiContent }));
    } catch (error) {
      console.error('Error saving AI content:', error);
    }
  }, [chapterId]);

  /**
   * Lock chapter content (called when user pastes/edits significantly)
   */
  const lockContent = useCallback(async (currentContent: string) => {
    if (!chapterId) return;

    const difference = state.lastAIContent 
      ? calculateContentDifference(state.lastAIContent, currentContent)
      : 100;

    const shouldLock = difference >= 70;

    if (shouldLock) {
      const ownership: ContentOwnership = {
        isUserAuthored: true,
        isAIGenerated: false,
        isHybrid: false,
        userLocked: true,
        differencePercentage: difference,
      };

      await updateOwnership(currentContent, ownership);
      setState(prev => ({ ...prev, ownership }));
    }

    return shouldLock;
  }, [chapterId, state.lastAIContent, updateOwnership]);

  /**
   * Unlock content (admin override or explicit user action)
   */
  const unlockContent = useCallback(async () => {
    if (!chapterId) return;

    try {
      await supabase
        .from('chapters')
        .update({
          user_locked: false,
        })
        .eq('id', chapterId);

      setState(prev => ({
        ...prev,
        ownership: prev.ownership ? { ...prev.ownership, userLocked: false } : null,
      }));
    } catch (error) {
      console.error('Error unlocking content:', error);
    }
  }, [chapterId]);

  return {
    ...state,
    checkOwnership,
    updateOwnership,
    saveAIContent,
    lockContent,
    unlockContent,
  };
}
