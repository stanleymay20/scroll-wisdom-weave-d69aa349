/**
 * Mastery Progress Hook
 * 
 * Tracks longitudinal learning progress across attempts,
 * aggregates Bloom distribution, and determines certification readiness.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import {
  type LearningAttempt,
  type MasteryAssessment,
  type BloomLevel,
  assessMastery,
  calculateImprovementDelta,
  classifyMastery,
  validateAttemptIntegrity,
  ANTI_GAMING,
} from '@/lib/masteryEngine';

const logger = createLogger('useMasteryProgress');

interface UseMasteryProgressOptions {
  bookId: string;
  userId?: string | null;
}

export function useMasteryProgress({ bookId, userId }: UseMasteryProgressOptions) {
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [assessment, setAssessment] = useState<MasteryAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all attempts for this book
  useEffect(() => {
    if (!userId || !bookId) {
      setIsLoading(false);
      return;
    }

    const fetchAttempts = async () => {
      try {
        const { data, error } = await supabase
          .from('learning_progress')
          .select('*')
          .eq('user_id', userId)
          .eq('book_id', bookId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const mapped: LearningAttempt[] = (data || []).map(d => ({
          id: d.id,
          userId: d.user_id,
          bookId: d.book_id,
          chapterId: d.chapter_id ?? undefined,
          attemptNumber: d.attempt_number,
          bloomLevel: d.bloom_level as BloomLevel,
          score: Number(d.score),
          questionDifficulty: d.question_difficulty,
          improvementDelta: Number(d.improvement_delta),
          masteryStatus: d.mastery_status as any,
          remediationTriggered: d.remediation_triggered,
          timeSpentSeconds: d.time_spent_seconds ?? 0,
          questionsAnswered: d.questions_answered ?? 0,
          createdAt: d.created_at,
        }));

        setAttempts(mapped);
        setAssessment(assessMastery(mapped));
      } catch (e) {
        logger.error('Failed to fetch learning progress:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttempts();
  }, [userId, bookId]);

  // Record a new learning attempt
  const recordAttempt = useCallback(async (
    chapterId: string,
    bloomLevel: BloomLevel,
    score: number,
    questionDifficulty: number,
    timeSpentSeconds: number,
    questionsAnswered: number,
  ) => {
    if (!userId || !bookId) return null;

    // Anti-gaming: count today's attempts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attemptsToday = attempts.filter(a => 
      a.createdAt && new Date(a.createdAt) >= today
    ).length;

    const validation = validateAttemptIntegrity(timeSpentSeconds, questionsAnswered, attemptsToday);
    if (!validation.valid) {
      logger.warn('Attempt blocked by anti-gaming:', { reason: validation.reason });
      return { blocked: true, reason: validation.reason };
    }

    setIsSaving(true);

    try {
      // Get previous attempt for this chapter
      const chapterAttempts = attempts.filter(a => a.chapterId === chapterId);
      const previousScore = chapterAttempts.length > 0 
        ? chapterAttempts[chapterAttempts.length - 1].score 
        : null;
      
      const attemptNumber = chapterAttempts.length + 1;
      const improvementDelta = calculateImprovementDelta(score, previousScore);
      const masteryStatus = classifyMastery(score);
      const remediationTriggered = score < 60;

      const record = {
        user_id: userId,
        book_id: bookId,
        chapter_id: chapterId,
        attempt_number: attemptNumber,
        bloom_level: bloomLevel,
        score,
        question_difficulty: questionDifficulty,
        improvement_delta: improvementDelta,
        mastery_status: masteryStatus,
        remediation_triggered: remediationTriggered,
        time_spent_seconds: timeSpentSeconds,
        questions_answered: questionsAnswered,
      };

      const { data, error } = await supabase
        .from('learning_progress')
        .insert(record as any)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      const newAttempt: LearningAttempt = {
        id: data.id,
        userId,
        bookId,
        chapterId,
        attemptNumber,
        bloomLevel,
        score,
        questionDifficulty,
        improvementDelta,
        masteryStatus,
        remediationTriggered,
        timeSpentSeconds,
        questionsAnswered,
        createdAt: data.created_at,
      };

      const updatedAttempts = [...attempts, newAttempt];
      setAttempts(updatedAttempts);
      setAssessment(assessMastery(updatedAttempts));

      // Update competency profile
      await updateCompetencyProfile(userId, bookId);

      return { blocked: false, attempt: newAttempt };
    } catch (e) {
      logger.error('Failed to record learning attempt:', e);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [userId, bookId, attempts]);

  // Update aggregated competency profile
  const updateCompetencyProfile = async (uid: string, bid: string) => {
    try {
      // Get book category for domain
      const { data: book } = await supabase
        .from('books')
        .select('category')
        .eq('id', bid)
        .single();

      const domain = book?.category || 'general';
      const currentAssessment = assessMastery(attempts);
      const dist = currentAssessment.bloomDistribution;

      const profileData: Record<string, unknown> = {
          user_id: uid,
          domain,
          remember_score: dist.remember,
          understand_score: dist.understand,
          apply_score: dist.apply,
          analyze_score: dist.analyze,
          evaluate_score: dist.evaluate,
          create_score: dist.create,
          growth_trend: currentAssessment.improvementTrend,
          total_attempts: currentAssessment.attemptCount,
          last_updated: new Date().toISOString(),
        };

        await supabase
          .from('competency_profile')
          .upsert(profileData as any, { onConflict: 'user_id,domain' });
    } catch (e) {
      logger.error('Failed to update competency profile:', e);
    }
  };

  return {
    attempts,
    assessment,
    isLoading,
    isSaving,
    recordAttempt,
    attemptsToday: attempts.filter(a => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return a.createdAt && new Date(a.createdAt) >= today;
    }).length,
    maxAttemptsPerDay: ANTI_GAMING.MAX_RETAKES_PER_DAY,
  };
}
