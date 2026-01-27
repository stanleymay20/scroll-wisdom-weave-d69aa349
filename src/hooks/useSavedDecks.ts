/**
 * Hook for managing saved learning decks
 * Provides CRUD operations for persisting generated decks
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LearningDeck } from '@/lib/learningDeckContract';
import { useToast } from '@/hooks/use-toast';

export interface SavedDeck {
  id: string;
  user_id: string;
  book_id: string;
  title: string;
  deck_data: LearningDeck;
  scope: string;
  chapters_covered: number[];
  target_audience: string;
  tone: string;
  slide_count: number;
  tier: string;
  created_at: string;
  updated_at: string;
}

interface UseSavedDecksOptions {
  bookId: string;
  userId: string | null;
}

export function useSavedDecks({ bookId, userId }: UseSavedDecksOptions) {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Fetch saved decks for this book
  const fetchDecks = useCallback(async () => {
    if (!userId || !bookId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_learning_decks')
        .select('*')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion for deck_data since it comes as JSON
      const typedDecks = (data || []).map(d => ({
        ...d,
        deck_data: d.deck_data as unknown as LearningDeck,
      })) as SavedDeck[];
      
      setDecks(typedDecks);
    } catch (err) {
      console.error('[SavedDecks] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, userId]);

  // Save a new deck
  const saveDeck = useCallback(async (deck: LearningDeck): Promise<boolean> => {
    if (!userId || !bookId) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to save learning decks.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSaving(true);
    try {
      // Insert with explicit type casting for Supabase
      const insertData = {
        user_id: userId,
        book_id: bookId,
        title: deck.title,
        deck_data: deck as unknown as Record<string, unknown>,
        scope: deck.metadata.scope,
        chapters_covered: deck.metadata.chaptersCovered || [],
        target_audience: deck.metadata.targetAudience,
        tone: deck.metadata.tone,
        slide_count: deck.slides.length,
        tier: deck.eligibility.tier,
      };
      
      const { error } = await supabase
        .from('saved_learning_decks')
        .insert(insertData as any);

      if (error) throw error;

      toast({
        title: 'Deck Saved!',
        description: 'Your learning deck has been saved for quick access.',
      });

      // Refresh list
      await fetchDecks();
      return true;
    } catch (err) {
      console.error('[SavedDecks] Save error:', err);
      toast({
        title: 'Save Failed',
        description: 'Could not save the deck. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [bookId, userId, toast, fetchDecks]);

  // Delete a saved deck
  const deleteDeck = useCallback(async (deckId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('saved_learning_decks')
        .delete()
        .eq('id', deckId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: 'Deck Deleted',
        description: 'The learning deck has been removed.',
      });

      // Update local state
      setDecks(prev => prev.filter(d => d.id !== deckId));
      return true;
    } catch (err) {
      console.error('[SavedDecks] Delete error:', err);
      toast({
        title: 'Delete Failed',
        description: 'Could not delete the deck.',
        variant: 'destructive',
      });
      return false;
    }
  }, [userId, toast]);

  // Initial fetch
  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  return {
    decks,
    isLoading,
    isSaving,
    saveDeck,
    deleteDeck,
    refresh: fetchDecks,
  };
}
