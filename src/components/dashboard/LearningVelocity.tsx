/**
 * Learning Velocity Tracker
 * 
 * Shows chapters/week trend, predicted completion date,
 * and comparison to personal best pace.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar, Zap, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface WeeklyData {
  week: string;
  chaptersRead: number;
  quizzesTaken: number;
  minutesSpent: number;
}

interface LearningVelocityProps {
  userId: string;
}

export function LearningVelocity({ userId }: LearningVelocityProps) {
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBooksInProgress, setTotalBooksInProgress] = useState(0);
  const [avgChaptersRemaining, setAvgChaptersRemaining] = useState(0);

  useEffect(() => {
    const fetchVelocity = async () => {
      try {
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

        const [sessionsRes, quizRes, libraryRes] = await Promise.all([
          supabase
            .from('reading_sessions')
            .select('started_at, duration_seconds, chapter_number')
            .eq('user_id', userId)
            .gte('started_at', fourWeeksAgo.toISOString())
            .order('started_at'),
          supabase
            .from('quiz_attempts')
            .select('created_at')
            .eq('user_id', userId)
            .gte('created_at', fourWeeksAgo.toISOString()),
          supabase
            .from('user_library')
            .select('progress_percent, book_id')
            .eq('user_id', userId),
        ]);

        const sessions = sessionsRes.data || [];
        const quizzes = quizRes.data || [];
        const library = libraryRes.data || [];

        // Group by week
        const weekMap = new Map<string, WeeklyData>();
        
        const getWeekKey = (dateStr: string) => {
          const d = new Date(dateStr);
          const startOfWeek = new Date(d);
          startOfWeek.setDate(d.getDate() - d.getDay());
          return startOfWeek.toISOString().split('T')[0];
        };

        // Track unique chapters per week
        const chaptersByWeek = new Map<string, Set<string>>();

        for (const session of sessions) {
          const week = getWeekKey(session.started_at);
          if (!weekMap.has(week)) {
            weekMap.set(week, { week, chaptersRead: 0, quizzesTaken: 0, minutesSpent: 0 });
            chaptersByWeek.set(week, new Set());
          }
          const entry = weekMap.get(week)!;
          entry.minutesSpent += Math.round((session.duration_seconds || 0) / 60);
          const chapterKey = `${session.chapter_number}`;
          const chapterSet = chaptersByWeek.get(week)!;
          if (!chapterSet.has(chapterKey)) {
            chapterSet.add(chapterKey);
            entry.chaptersRead++;
          }
        }

        for (const quiz of quizzes) {
          const week = getWeekKey(quiz.created_at);
          if (!weekMap.has(week)) {
            weekMap.set(week, { week, chaptersRead: 0, quizzesTaken: 0, minutesSpent: 0 });
          }
          weekMap.get(week)!.quizzesTaken++;
        }

        const sorted = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));
        setWeeklyData(sorted);

        // Books in progress
        const inProgress = library.filter(l => (l.progress_percent || 0) > 0 && (l.progress_percent || 0) < 100);
        setTotalBooksInProgress(inProgress.length);
        
        // Estimate remaining chapters (rough)
        const avgRemaining = inProgress.length > 0
          ? inProgress.reduce((sum, l) => sum + (100 - (l.progress_percent || 0)), 0) / inProgress.length / 10
          : 0;
        setAvgChaptersRemaining(Math.round(avgRemaining));

      } catch (e) {
        console.error('[LearningVelocity] Error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) fetchVelocity();
  }, [userId]);

  const stats = useMemo(() => {
    if (weeklyData.length === 0) return null;
    
    const currentWeek = weeklyData[weeklyData.length - 1];
    const avgChapters = weeklyData.reduce((s, w) => s + w.chaptersRead, 0) / weeklyData.length;
    const bestWeek = Math.max(...weeklyData.map(w => w.chaptersRead));
    const totalMinutes = weeklyData.reduce((s, w) => s + w.minutesSpent, 0);
    
    // Predicted completion
    const weeksToComplete = avgChapters > 0 ? Math.ceil(avgChaptersRemaining / avgChapters) : null;
    const completionDate = weeksToComplete 
      ? new Date(Date.now() + weeksToComplete * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    // Trend
    const trend = weeklyData.length >= 2
      ? currentWeek.chaptersRead >= weeklyData[weeklyData.length - 2].chaptersRead
        ? 'up' : 'down'
      : 'stable';

    return {
      currentWeekChapters: currentWeek.chaptersRead,
      avgChaptersPerWeek: Math.round(avgChapters * 10) / 10,
      bestWeekChapters: bestWeek,
      totalMinutes,
      weeksToComplete,
      completionDate,
      trend,
    };
  }, [weeklyData, avgChaptersRemaining]);

  if (isLoading || !stats) return null;

  const maxChapters = Math.max(...weeklyData.map(w => w.chaptersRead), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          <span className="font-semibold text-sm">Learning Velocity</span>
        </div>
        <Badge variant={stats.trend === 'up' ? 'default' : 'outline'} className="text-xs">
          {stats.trend === 'up' ? '📈 Accelerating' : stats.trend === 'down' ? '📉 Slowing' : '➡️ Steady'}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/30 rounded-lg p-2">
          <p className="text-lg font-bold text-foreground">{stats.currentWeekChapters}</p>
          <p className="text-[10px] text-muted-foreground">This Week</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2">
          <p className="text-lg font-bold text-foreground">{stats.avgChaptersPerWeek}</p>
          <p className="text-[10px] text-muted-foreground">Avg/Week</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-2">
          <p className="text-lg font-bold text-foreground">{stats.bestWeekChapters}</p>
          <p className="text-[10px] text-muted-foreground">Best Week</p>
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <BarChart3 className="h-3 w-3" /> Weekly chapters (last 4 weeks)
        </p>
        <div className="flex items-end gap-1.5 h-12">
          {weeklyData.slice(-4).map((w, i) => (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-0.5">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(8, (w.chaptersRead / maxChapters) * 100)}%` }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "w-full rounded-t",
                  i === weeklyData.slice(-4).length - 1 ? "bg-primary" : "bg-primary/40"
                )}
              />
              <span className="text-[9px] text-muted-foreground">{w.chaptersRead}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Prediction */}
      {stats.completionDate && totalBooksInProgress > 0 && (
        <div className="flex items-center gap-2 bg-primary/5 rounded-lg p-2.5">
          <Calendar className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs font-medium">Predicted completion: {stats.completionDate}</p>
            <p className="text-[10px] text-muted-foreground">
              {stats.weeksToComplete} weeks at current pace ({totalBooksInProgress} books in progress)
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
