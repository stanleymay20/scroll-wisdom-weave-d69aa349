/**
 * VLD-1.0: Learning Deck Eligibility Hook
 * 
 * Tracks user's progress toward deck generation eligibility
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  checkDeckEligibility, 
  DeckScope, 
  DeckEligibility,
  VLD_ELIGIBILITY 
} from '@/lib/learningDeckContract';

interface UseLearningDeckEligibilityProps {
  bookId: string;
  userId: string | null;
  totalChapters: number;
  scope?: DeckScope;
  targetChapters?: number[];
}

interface LearningDeckEligibilityResult {
  eligibility: DeckEligibility | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  chapterProgress: Map<number, number>;
  quizAttempts: Map<number, boolean>;
}

export function useLearningDeckEligibility({
  bookId,
  userId,
  totalChapters,
  scope = 'chapter',
  targetChapters,
}: UseLearningDeckEligibilityProps): LearningDeckEligibilityResult {
  const [chapterProgress, setChapterProgress] = useState<Map<number, number>>(new Map());
  const [quizAttempts, setQuizAttempts] = useState<Map<number, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!bookId || !userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch reading progress from user_library
      const { data: libraryData } = await supabase
        .from('user_library')
        .select('progress_percent, last_read_chapter')
        .eq('book_id', bookId)
        .eq('user_id', userId)
        .single();

      // Fetch quiz attempts (no 'passed' column exists)
      const { data: quizData } = await supabase
        .from('quiz_attempts')
        .select('chapter_id, score, total_questions')
        .eq('book_id', bookId)
        .eq('user_id', userId);

      // Fetch chapter info to map chapter_id to chapter_number
      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('book_id', bookId);

      // Build chapter ID to number map
      const chapterIdToNumber = new Map<string, number>();
      chaptersData?.forEach(ch => {
        chapterIdToNumber.set(ch.id, ch.chapter_number);
      });

      // Calculate per-chapter reading progress
      // This is a simplified model - in production you'd track per-chapter progress
      const progressMap = new Map<number, number>();
      const overallProgress = libraryData?.progress_percent || 0;
      const lastRead = libraryData?.last_read_chapter || 0;
      
      for (let i = 1; i <= totalChapters; i++) {
        if (i < lastRead) {
          // Completed chapters
          progressMap.set(i, 100);
        } else if (i === lastRead) {
          // Current chapter - proportional progress
          const remainingProgress = overallProgress - ((lastRead - 1) / totalChapters * 100);
          const chapterProgress = Math.min(100, remainingProgress * totalChapters);
          progressMap.set(i, Math.max(0, chapterProgress));
        } else {
          // Future chapters
          progressMap.set(i, 0);
        }
      }
      setChapterProgress(progressMap);

      // Build quiz attempts map
      const quizMap = new Map<number, boolean>();
      quizData?.forEach(attempt => {
        const chapterNum = chapterIdToNumber.get(attempt.chapter_id);
        if (chapterNum !== undefined) {
          quizMap.set(chapterNum, true);
        }
      });
      setQuizAttempts(quizMap);

    } catch (err) {
      console.error('[VLD] Error fetching eligibility data:', err);
      setError('Failed to load progress data');
    } finally {
      setIsLoading(false);
    }
  }, [bookId, userId, totalChapters]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const eligibility = useMemo(() => {
    if (!bookId || totalChapters === 0) return null;

    return checkDeckEligibility(
      scope,
      chapterProgress,
      quizAttempts,
      totalChapters,
      targetChapters,
      false // hasIntegrityFlags - would come from integrity system
    );
  }, [bookId, scope, chapterProgress, quizAttempts, totalChapters, targetChapters]);

  return {
    eligibility,
    isLoading,
    error,
    refresh: fetchProgress,
    chapterProgress,
    quizAttempts,
  };
}
