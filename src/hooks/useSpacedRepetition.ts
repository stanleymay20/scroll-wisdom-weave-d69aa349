/**
 * Spaced Repetition Hook
 * 
 * Manages SRS cards: fetch, review, create from quiz results.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import {
  type SRSCard,
  type ReviewQuality,
  getSRSStats,
} from '@/lib/spacedRepetition';
import { reviewFsrs, qualityToFsrsRating } from '@/lib/fsrs';

const logger = createLogger('useSpacedRepetition');

interface UseSpacedRepetitionOptions {
  userId?: string | null;
  bookId?: string;
}

export function useSpacedRepetition({ userId, bookId }: UseSpacedRepetitionOptions) {
  const [cards, setCards] = useState<SRSCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setIsLoading(false); return; }

    const fetchCards = async () => {
      try {
        let query = supabase
          .from('spaced_repetition_cards')
          .select('*')
          .eq('user_id', userId)
          .order('next_review_at', { ascending: true });

        if (bookId) query = query.eq('book_id', bookId);

        const { data, error } = await query.limit(500);
        if (error) throw error;

        setCards((data || []).map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          bookId: d.book_id,
          chapterId: d.chapter_id,
          question: d.question,
          answer: d.answer,
          bloomLevel: d.bloom_level,
          easeFactor: Number(d.ease_factor),
          intervalDays: d.interval_days,
          repetitions: d.repetitions,
          nextReviewAt: d.next_review_at,
          lastReviewedAt: d.last_reviewed_at,
          totalReviews: d.total_reviews,
          correctReviews: d.correct_reviews,
          streak: d.streak,
          createdAt: d.created_at,
        })));
      } catch (e) {
        logger.error('Failed to fetch SRS cards:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCards();
  }, [userId, bookId]);

  const reviewCard = useCallback(async (cardId: string, quality: ReviewQuality) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    // FSRS-5: difficulty stored in ease_factor, stability in interval_days.
    const elapsedMs = card.lastReviewedAt
      ? Date.now() - new Date(card.lastReviewedAt).getTime()
      : 0;
    const elapsedDays = Math.max(0, elapsedMs / 86_400_000);

    const result = reviewFsrs(
      {
        difficulty: card.easeFactor,
        stability: card.intervalDays,
        repetitions: card.repetitions,
      },
      qualityToFsrsRating(quality),
      elapsedDays,
    );

    const isCorrect = quality >= 3;
    const updates = {
      ease_factor: result.difficulty,
      interval_days: Math.max(1, Math.round(result.stability)),
      repetitions: result.repetitions,
      next_review_at: result.nextReviewAt.toISOString(),
      last_reviewed_at: new Date().toISOString(),
      total_reviews: card.totalReviews + 1,
      correct_reviews: card.correctReviews + (isCorrect ? 1 : 0),
      streak: isCorrect ? card.streak + 1 : 0,
    };

    const { error } = await supabase
      .from('spaced_repetition_cards')
      .update(updates as any)
      .eq('id', cardId);

    if (error) { logger.error('Failed to update SRS card:', error as any); return; }

    setCards(prev => prev.map(c => c.id === cardId ? {
      ...c,
      easeFactor: result.difficulty,
      intervalDays: Math.max(1, Math.round(result.stability)),
      repetitions: result.repetitions,
      nextReviewAt: result.nextReviewAt.toISOString(),
      lastReviewedAt: new Date().toISOString(),
      totalReviews: c.totalReviews + 1,
      correctReviews: c.correctReviews + (isCorrect ? 1 : 0),
      streak: isCorrect ? c.streak + 1 : 0,
    } : c));
  }, [cards]);

  const addCards = useCallback(async (
    newCards: { question: string; answer: string; bloomLevel: string; bookId: string; chapterId?: string }[]
  ) => {
    if (!userId) return;

    const records = newCards.map(c => ({
      user_id: userId,
      book_id: c.bookId,
      chapter_id: c.chapterId || null,
      question: c.question,
      answer: c.answer,
      bloom_level: c.bloomLevel,
    }));

    const { data, error } = await supabase
      .from('spaced_repetition_cards')
      .insert(records as any)
      .select();

    if (error) { logger.error('Failed to add SRS cards:', error as any); return; }

    const mapped = (data || []).map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      bookId: d.book_id,
      chapterId: d.chapter_id,
      question: d.question,
      answer: d.answer,
      bloomLevel: d.bloom_level,
      easeFactor: Number(d.ease_factor),
      intervalDays: d.interval_days,
      repetitions: d.repetitions,
      nextReviewAt: d.next_review_at,
      lastReviewedAt: d.last_reviewed_at,
      totalReviews: d.total_reviews,
      correctReviews: d.correct_reviews,
      streak: d.streak,
      createdAt: d.created_at,
    }));

    setCards(prev => [...prev, ...mapped]);
  }, [userId]);

  const stats = getSRSStats(cards);
  const dueCards = cards.filter(c => new Date(c.nextReviewAt) <= new Date());

  return {
    cards,
    dueCards,
    stats,
    isLoading,
    reviewCard,
    addCards,
  };
}
