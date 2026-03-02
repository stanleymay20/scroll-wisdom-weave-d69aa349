/**
 * Adaptive Difficulty Hook
 * 
 * Reads learning_progress history and computes adaptive recommendations.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  type PerformanceSnapshot,
  type AdaptiveRecommendation,
  computeAdaptiveRecommendation,
} from '@/lib/adaptiveDifficulty';
import { type BloomLevel } from '@/lib/masteryEngine';

interface UseAdaptiveDifficultyOptions {
  userId?: string | null;
  bookId: string;
  chapterId?: string;
}

export function useAdaptiveDifficulty({ userId, bookId, chapterId }: UseAdaptiveDifficultyOptions) {
  const [recommendation, setRecommendation] = useState<AdaptiveRecommendation | null>(null);
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId || !bookId) { setIsLoading(false); return; }

    const fetch = async () => {
      try {
        let query = supabase
          .from('learning_progress')
          .select('score, bloom_level, question_difficulty, time_spent_seconds, questions_answered, created_at')
          .eq('user_id', userId)
          .eq('book_id', bookId)
          .order('created_at', { ascending: true })
          .limit(50);

        if (chapterId) query = query.eq('chapter_id', chapterId);

        const { data, error } = await query;
        if (error) throw error;

        const snapshots: PerformanceSnapshot[] = (data || []).map((d: any) => ({
          score: Number(d.score),
          bloomLevel: d.bloom_level as BloomLevel,
          difficulty: d.question_difficulty,
          timeSpentSeconds: d.time_spent_seconds || 0,
          questionsAnswered: d.questions_answered || 0,
          createdAt: d.created_at,
        }));

        setHistory(snapshots);
        const currentDiff = snapshots.length > 0 ? snapshots[snapshots.length - 1].difficulty : 3;
        setRecommendation(computeAdaptiveRecommendation(snapshots, currentDiff));
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, [userId, bookId, chapterId]);

  return { recommendation, history, isLoading };
}
