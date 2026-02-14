/**
 * Competency Progress Hook
 * 
 * Tracks Kolb's 4-phase learning cycle per chapter:
 * Phase 1: Concept → Phase 2: Reflection → Phase 3: Application → Phase 4: Competency Check
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useCompetencyProgress');

export type CompetencyPhase = 'concept' | 'reflection' | 'application' | 'competency_check' | 'completed';

export interface CompetencyProgressData {
  id?: string;
  currentPhase: CompetencyPhase;
  conceptCompleted: boolean;
  reflectionSubmitted: boolean;
  reflectionText?: string;
  reflectionScore?: number;
  reflectionFeedback?: string;
  applicationSubmitted: boolean;
  applicationResponse?: string;
  applicationScore?: number;
  applicationEvaluation?: Record<string, unknown>;
  competencyCheckPassed: boolean;
  competencyScore?: number;
  overallScore?: number;
}

interface UseCompetencyProgressOptions {
  bookId: string;
  chapterNumber: number;
  userId?: string | null;
}

const EMPTY_PROGRESS: CompetencyProgressData = {
  currentPhase: 'concept',
  conceptCompleted: false,
  reflectionSubmitted: false,
  applicationSubmitted: false,
  competencyCheckPassed: false,
};

export function useCompetencyProgress({ bookId, chapterNumber, userId }: UseCompetencyProgressOptions) {
  const [progress, setProgress] = useState<CompetencyProgressData>(EMPTY_PROGRESS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing progress
  useEffect(() => {
    if (!userId || !bookId) {
      setIsLoading(false);
      return;
    }

    const fetchProgress = async () => {
      try {
        const { data, error } = await supabase
          .from('competency_progress')
          .select('*')
          .eq('user_id', userId)
          .eq('book_id', bookId)
          .eq('chapter_number', chapterNumber)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setProgress({
            id: data.id,
            currentPhase: data.current_phase as CompetencyPhase,
            conceptCompleted: data.concept_completed ?? false,
            reflectionSubmitted: data.reflection_submitted ?? false,
            reflectionText: data.reflection_text ?? undefined,
            reflectionScore: data.reflection_quality_score ?? undefined,
            reflectionFeedback: data.reflection_ai_feedback ?? undefined,
            applicationSubmitted: data.application_submitted ?? false,
            applicationResponse: data.application_response ?? undefined,
            applicationScore: data.application_score ?? undefined,
            applicationEvaluation: (data.application_ai_evaluation as Record<string, unknown>) ?? undefined,
            competencyCheckPassed: data.competency_check_passed ?? false,
            competencyScore: data.competency_score ?? undefined,
            overallScore: data.overall_score ?? undefined,
          });
        }
      } catch (e) {
        logger.error('Failed to fetch competency progress:', e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgress();
  }, [userId, bookId, chapterNumber]);

  // Upsert progress to DB
  const saveProgress = useCallback(async (updates: Partial<CompetencyProgressData>) => {
    if (!userId || !bookId) return;
    setIsSaving(true);

    const newProgress = { ...progress, ...updates };
    setProgress(newProgress);

    try {
      const dbData: Record<string, unknown> = {
        user_id: userId,
        book_id: bookId,
        chapter_number: chapterNumber,
        current_phase: newProgress.currentPhase,
        concept_completed: newProgress.conceptCompleted,
        concept_completed_at: newProgress.conceptCompleted ? new Date().toISOString() : null,
        reflection_submitted: newProgress.reflectionSubmitted,
        reflection_text: newProgress.reflectionText,
        reflection_quality_score: newProgress.reflectionScore,
        reflection_ai_feedback: newProgress.reflectionFeedback,
        reflection_submitted_at: newProgress.reflectionSubmitted ? new Date().toISOString() : null,
        application_submitted: newProgress.applicationSubmitted,
        application_response: newProgress.applicationResponse,
        application_score: newProgress.applicationScore,
        application_ai_evaluation: newProgress.applicationEvaluation ?? {},
        application_submitted_at: newProgress.applicationSubmitted ? new Date().toISOString() : null,
        competency_check_passed: newProgress.competencyCheckPassed,
        competency_score: newProgress.competencyScore,
        competency_checked_at: newProgress.competencyCheckPassed ? new Date().toISOString() : null,
        overall_score: newProgress.overallScore,
      };

      const { error } = await supabase
        .from('competency_progress')
        .upsert(dbData as any, { onConflict: 'user_id,book_id,chapter_number' });

      if (error) throw error;
    } catch (e) {
      logger.error('Failed to save competency progress:', e);
    } finally {
      setIsSaving(false);
    }
  }, [userId, bookId, chapterNumber, progress]);

  // Phase transition helpers
  const completeConceptPhase = useCallback(() => {
    saveProgress({
      conceptCompleted: true,
      currentPhase: 'reflection',
    });
  }, [saveProgress]);

  const submitReflection = useCallback((text: string, score?: number, feedback?: string) => {
    saveProgress({
      reflectionSubmitted: true,
      reflectionText: text,
      reflectionScore: score,
      reflectionFeedback: feedback,
      currentPhase: 'application',
    });
  }, [saveProgress]);

  const submitApplication = useCallback((response: string, score?: number, evaluation?: Record<string, unknown>) => {
    saveProgress({
      applicationSubmitted: true,
      applicationResponse: response,
      applicationScore: score,
      applicationEvaluation: evaluation,
      currentPhase: 'competency_check',
    });
  }, [saveProgress]);

  const completeCompetencyCheck = useCallback((score: number, passed: boolean) => {
    const overallScore = calculateOverall(progress.reflectionScore, progress.applicationScore, score);
    saveProgress({
      competencyCheckPassed: passed,
      competencyScore: score,
      overallScore,
      currentPhase: passed ? 'completed' : 'competency_check',
    });
  }, [saveProgress, progress.reflectionScore, progress.applicationScore]);

  return {
    progress,
    isLoading,
    isSaving,
    completeConceptPhase,
    submitReflection,
    submitApplication,
    completeCompetencyCheck,
  };
}

/** Weighted formula: Reflection × 0.3 + Application × 0.3 + Quiz × 0.4 */
function calculateOverall(reflection?: number, application?: number, competency?: number): number {
  const r = reflection ?? 0;
  const a = application ?? 0;
  const q = competency ?? 0;
  // If no scores at all, return 0
  if (reflection == null && application == null && competency == null) return 0;
  return (r * 0.3) + (a * 0.3) + (q * 0.4);
}
