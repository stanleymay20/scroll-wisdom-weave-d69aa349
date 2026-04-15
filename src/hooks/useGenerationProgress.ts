/**
 * GENERATION PROGRESS TRACKING
 * 
 * Real-time hook for monitoring book generation progress.
 * Uses Supabase Realtime for live updates.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'partial';

export interface GenerationJob {
  id: string;
  bookId: string;
  status: GenerationStatus;
  currentChapter: number;
  totalChapters: number;
  errorCode?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  progress: number; // 0-100
}

/**
 * Hook to track generation progress for a specific book
 */
export function useGenerationProgress(bookId: string | null) {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mapRow = useCallback((row: any): GenerationJob => ({
    id: row.id,
    bookId: row.book_id,
    status: row.status,
    currentChapter: row.current_chapter,
    totalChapters: row.total_chapters,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    progress: row.total_chapters > 0
      ? Math.round((row.current_chapter / row.total_chapters) * 100)
      : 0,
  }), []);

  // Fetch current job status
  useEffect(() => {
    if (!bookId) return;

    setIsLoading(true);
    supabase
      .from('generation_jobs')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setJob(mapRow(data));
        setIsLoading(false);
      });
  }, [bookId, mapRow]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!bookId) return;

    const channel = supabase
      .channel(`gen-job:${bookId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_jobs',
          filter: `book_id=eq.${bookId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            setJob(mapRow(payload.new));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId, mapRow]);

  return {
    job,
    isLoading,
    isGenerating: job?.status === 'generating' || job?.status === 'pending',
    isComplete: job?.status === 'completed',
    isFailed: job?.status === 'failed' || job?.status === 'partial',
    progress: job?.progress ?? 0,
  };
}

/**
 * Hook to track all active generation jobs for the current user
 */
export function useActiveGenerations() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);

  useEffect(() => {
    const fetchActive = async () => {
      const { data } = await supabase
        .from('generation_jobs')
        .select('*')
        .in('status', ['pending', 'generating'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setJobs(data.map((row: any) => ({
          id: row.id,
          bookId: row.book_id,
          status: row.status,
          currentChapter: row.current_chapter,
          totalChapters: row.total_chapters,
          errorCode: row.error_code,
          errorMessage: row.error_message,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          progress: row.total_chapters > 0
            ? Math.round((row.current_chapter / row.total_chapters) * 100)
            : 0,
        })));
      }
    };

    fetchActive();

    // Subscribe to all generation job updates for the user
    const channel = supabase
      .channel('active-generations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_jobs',
        },
        () => {
          fetchActive(); // Re-fetch on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { jobs, hasActive: jobs.length > 0 };
}
