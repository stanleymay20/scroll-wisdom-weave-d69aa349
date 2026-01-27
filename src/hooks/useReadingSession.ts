/**
 * Reading Session Tracking Hook
 * 
 * Tracks time spent reading each chapter with:
 * - Automatic session start/stop
 * - Periodic saves to prevent data loss
 * - Weekly goal progress tracking
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ReadingSession {
  id: string;
  bookId: string;
  chapterId: string | null;
  startedAt: Date;
  durationSeconds: number;
}

interface WeeklyProgress {
  totalMinutes: number;
  goalMinutes: number;
  percentComplete: number;
  sessionsThisWeek: number;
}

export function useReadingSession(bookId: string, chapterId: string | null) {
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [weeklyProgress, setWeeklyProgress] = useState<WeeklyProgress>({
    totalMinutes: 0,
    goalMinutes: 60,
    percentComplete: 0,
    sessionsThisWeek: 0,
  });
  const [isTracking, setIsTracking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const saveIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const sessionIdRef = useRef<string | null>(null);

  // Start a new reading session
  const startSession = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('reading_sessions')
        .insert({
          user_id: user.id,
          book_id: bookId,
          chapter_id: chapterId,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      sessionIdRef.current = data.id;
      setSession({
        id: data.id,
        bookId,
        chapterId,
        startedAt: new Date(),
        durationSeconds: 0,
      });
      setElapsedSeconds(0);
      setIsTracking(true);

      // Start the timer
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);

      // Save progress every 30 seconds
      saveIntervalRef.current = setInterval(() => {
        saveProgress();
      }, 30000);

    } catch (error) {
      console.error('Failed to start reading session:', error);
    }
  }, [bookId, chapterId]);

  // Save current progress
  const saveProgress = useCallback(async () => {
    if (!sessionIdRef.current) return;

    try {
      await supabase
        .from('reading_sessions')
        .update({
          duration_seconds: elapsedSeconds,
        })
        .eq('id', sessionIdRef.current);
    } catch (error) {
      console.error('Failed to save session progress:', error);
    }
  }, [elapsedSeconds]);

  // End the current session
  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) return;

    // Clear intervals
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);

    try {
      await supabase
        .from('reading_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: elapsedSeconds,
        })
        .eq('id', sessionIdRef.current);

      sessionIdRef.current = null;
      setSession(null);
      setIsTracking(false);

      // Refresh weekly progress
      fetchWeeklyProgress();
    } catch (error) {
      console.error('Failed to end reading session:', error);
    }
  }, [elapsedSeconds]);

  // Pause tracking (e.g., when tab is hidden)
  const pauseSession = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    saveProgress();
  }, [saveProgress]);

  // Resume tracking
  const resumeSession = useCallback(() => {
    if (isTracking && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
  }, [isTracking]);

  // Fetch weekly progress
  const fetchWeeklyProgress = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get start of current week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      // Fetch sessions for this week
      const { data: sessions } = await supabase
        .from('reading_sessions')
        .select('duration_seconds')
        .eq('user_id', user.id)
        .gte('started_at', weekStart.toISOString());

      // Fetch user's goal
      const { data: goalData } = await supabase
        .from('reading_goals')
        .select('weekly_minutes_goal')
        .eq('user_id', user.id)
        .maybeSingle();

      const totalSeconds = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
      const totalMinutes = Math.floor(totalSeconds / 60);
      const goalMinutes = goalData?.weekly_minutes_goal || 60;

      setWeeklyProgress({
        totalMinutes,
        goalMinutes,
        percentComplete: Math.min(100, Math.round((totalMinutes / goalMinutes) * 100)),
        sessionsThisWeek: sessions?.length || 0,
      });
    } catch (error) {
      console.error('Failed to fetch weekly progress:', error);
    }
  }, []);

  // Update weekly goal
  const updateWeeklyGoal = useCallback(async (minutes: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('reading_goals')
        .upsert({
          user_id: user.id,
          weekly_minutes_goal: minutes,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      setWeeklyProgress(prev => ({
        ...prev,
        goalMinutes: minutes,
        percentComplete: Math.min(100, Math.round((prev.totalMinutes / minutes) * 100)),
      }));
    } catch (error) {
      console.error('Failed to update weekly goal:', error);
    }
  }, []);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseSession();
      } else {
        resumeSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseSession, resumeSession]);

  // Auto-start session and fetch weekly progress
  useEffect(() => {
    startSession();
    fetchWeeklyProgress();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      // Save on unmount
      if (sessionIdRef.current) {
        endSession();
      }
    };
  }, [bookId, chapterId]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    isTracking,
    weeklyProgress,
    updateWeeklyGoal,
    pauseSession,
    resumeSession,
    endSession,
  };
}
