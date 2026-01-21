/**
 * QUIZ GATING HOOK
 * 
 * Enforces that chapters must be read before quizzes unlock.
 * Rule: Quiz is LOCKED until previous sections are read (minimum 80% scroll progress).
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QuizGatingState {
  isQuizUnlocked: boolean;
  readProgress: number;
  requiredProgress: number;
  chaptersCompleted: number[];
  isLoading: boolean;
}

interface UseQuizGatingProps {
  bookId: string;
  chapterNumber: number;
  userId?: string | null;
}

const MINIMUM_READ_PROGRESS = 80; // Must read 80% of chapter to unlock quiz

export function useQuizGating({ bookId, chapterNumber, userId }: UseQuizGatingProps) {
  const [state, setState] = useState<QuizGatingState>({
    isQuizUnlocked: false,
    readProgress: 0,
    requiredProgress: MINIMUM_READ_PROGRESS,
    chaptersCompleted: [],
    isLoading: true,
  });

  // Load user's chapter progress from database
  useEffect(() => {
    if (!userId || !bookId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const loadProgress = async () => {
      try {
        // Get library entry for this book
        const { data: libraryEntry, error } = await supabase
          .from('user_library')
          .select('progress_percent, last_read_chapter')
          .eq('user_id', userId)
          .eq('book_id', bookId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading quiz gating progress:', error);
        }

        // Get quiz attempts to determine completed chapters
        const { data: quizAttempts } = await supabase
          .from('quiz_attempts')
          .select('chapter_id, score')
          .eq('user_id', userId)
          .eq('book_id', bookId)
          .gte('score', 70); // Passed quizzes

        // Get chapter IDs to map to chapter numbers
        const { data: chapters } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('book_id', bookId);

        const completedChapterNumbers: number[] = [];
        if (quizAttempts && chapters) {
          const chapterMap = new Map(chapters.map(ch => [ch.id, ch.chapter_number]));
          quizAttempts.forEach(attempt => {
            const chapterNum = chapterMap.get(attempt.chapter_id);
            if (chapterNum && !completedChapterNumbers.includes(chapterNum)) {
              completedChapterNumbers.push(chapterNum);
            }
          });
        }

        // Calculate read progress for current chapter
        // If this is the first chapter or previous chapters have been completed, use stored progress
        const lastReadChapter = libraryEntry?.last_read_chapter || 1;
        const overallProgress = libraryEntry?.progress_percent || 0;
        
        // Estimate current chapter progress based on overall progress
        // This is a simplification - ideally we'd track per-chapter progress
        let currentChapterProgress = 0;
        if (lastReadChapter >= chapterNumber) {
          // If user has read past this chapter, assume it's complete
          currentChapterProgress = 100;
        } else if (lastReadChapter === chapterNumber - 1) {
          // If user is on this chapter, use partial progress
          currentChapterProgress = Math.min(100, overallProgress % 100);
        }

        // Quiz is unlocked if:
        // 1. Previous chapters are completed (for chapters > 1)
        // 2. Current chapter has been read to MINIMUM_READ_PROGRESS
        const previousChaptersComplete = chapterNumber === 1 || 
          completedChapterNumbers.includes(chapterNumber - 1) ||
          lastReadChapter >= chapterNumber;

        const isQuizUnlocked = previousChaptersComplete && currentChapterProgress >= MINIMUM_READ_PROGRESS;

        setState({
          isQuizUnlocked,
          readProgress: currentChapterProgress,
          requiredProgress: MINIMUM_READ_PROGRESS,
          chaptersCompleted: completedChapterNumbers,
          isLoading: false,
        });
      } catch (err) {
        console.error('Quiz gating check failed:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    loadProgress();
  }, [userId, bookId, chapterNumber]);

  // Update progress in real-time as user scrolls
  const updateReadProgress = useCallback((progress: number) => {
    setState(prev => {
      const newProgress = Math.max(prev.readProgress, progress);
      const isQuizUnlocked = newProgress >= MINIMUM_READ_PROGRESS;
      return {
        ...prev,
        readProgress: newProgress,
        isQuizUnlocked: prev.isQuizUnlocked || isQuizUnlocked,
      };
    });
  }, []);

  // Mark chapter as complete (called after quiz is passed)
  const markChapterComplete = useCallback((chapterNum: number) => {
    setState(prev => ({
      ...prev,
      chaptersCompleted: [...prev.chaptersCompleted, chapterNum].filter((v, i, a) => a.indexOf(v) === i),
    }));
  }, []);

  return {
    ...state,
    updateReadProgress,
    markChapterComplete,
  };
}
