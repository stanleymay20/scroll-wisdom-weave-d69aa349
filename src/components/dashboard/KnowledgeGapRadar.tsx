/**
 * Knowledge Gap Radar Chart
 * 
 * Enhanced Bloom's taxonomy radar with actionable focus recommendations.
 * Uses Recharts for the radar visualization.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Target, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts';

interface BloomScore {
  level: string;
  score: number;
  fullMark: 100;
}

interface KnowledgeGapRadarProps {
  userId: string;
  bookId?: string;
}

const BLOOM_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

export function KnowledgeGapRadar({ userId, bookId }: KnowledgeGapRadarProps) {
  const [bloomScores, setBloomScores] = useState<BloomScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  useEffect(() => {
    const fetchBloomData = async () => {
      try {
        let query = supabase
          .from('learning_progress')
          .select('bloom_level, score')
          .eq('user_id', userId);
        
        if (bookId) query = query.eq('book_id', bookId);
        
        const { data } = await query;
        if (!data || data.length === 0) {
          setIsLoading(false);
          return;
        }

        // Aggregate scores per bloom level
        const bloomMap = new Map<string, { total: number; count: number }>();
        for (const entry of data) {
          const level = entry.bloom_level.charAt(0).toUpperCase() + entry.bloom_level.slice(1);
          if (!bloomMap.has(level)) bloomMap.set(level, { total: 0, count: 0 });
          const item = bloomMap.get(level)!;
          item.total += Number(entry.score);
          item.count++;
        }

        const scores = BLOOM_ORDER.map(level => ({
          level,
          score: bloomMap.has(level) 
            ? Math.round(bloomMap.get(level)!.total / bloomMap.get(level)!.count) 
            : 0,
          fullMark: 100 as const,
        }));

        setBloomScores(scores);

        // Find weak areas (below 60)
        const weak = scores.filter(s => s.score < 60 && s.score > 0).map(s => s.level);
        const untested = scores.filter(s => s.score === 0).map(s => s.level);
        setWeakAreas(weak);

        // Generate recommendations
        const recs: string[] = [];
        if (weak.includes('Remember')) recs.push('Use flashcards to strengthen foundational recall');
        if (weak.includes('Apply')) recs.push('Try scenario exercises to practice real-world application');
        if (weak.includes('Analyze')) recs.push('Focus on comparison and trade-off questions');
        if (weak.includes('Evaluate')) recs.push('Attempt mastery-mode quizzes with higher difficulty');
        if (untested.length > 0) recs.push(`Test yourself on: ${untested.join(', ')}`);
        if (recs.length === 0 && scores.every(s => s.score >= 80)) {
          recs.push('Excellent! You\'ve mastered all cognitive levels');
        }
        setRecommendations(recs.slice(0, 3));

      } catch (e) {
        console.error('[KnowledgeGapRadar] Error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId) fetchBloomData();
  }, [userId, bookId]);

  if (isLoading || bloomScores.length === 0) return null;

  const overallScore = Math.round(
    bloomScores.filter(s => s.score > 0).reduce((s, b) => s + b.score, 0) / 
    Math.max(1, bloomScores.filter(s => s.score > 0).length)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          <span className="font-semibold text-sm">Cognitive Profile</span>
        </div>
        <Badge variant="outline" className="text-xs">
          Overall: {overallScore}%
        </Badge>
      </div>

      {/* Radar Chart */}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={bloomScores} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <PolarAngleAxis 
              dataKey="level" 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
            />
            <PolarRadiusAxis 
              angle={30} 
              domain={[0, 100]} 
              tick={{ fontSize: 8 }}
              tickCount={4}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Score pills */}
      <div className="flex flex-wrap gap-1.5">
        {bloomScores.map(b => (
          <div
            key={b.level}
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium",
              b.score >= 80 ? "bg-emerald-500/10 text-emerald-600" :
              b.score >= 60 ? "bg-amber-500/10 text-amber-600" :
              b.score > 0 ? "bg-red-500/10 text-red-600" :
              "bg-muted/40 text-muted-foreground"
            )}
          >
            {b.level}: {b.score > 0 ? `${b.score}%` : '—'}
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-medium text-violet-600 flex items-center gap-1">
            <Target className="h-3 w-3" /> Recommendations
          </p>
          {recommendations.map((rec, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {rec}</p>
          ))}
        </div>
      )}
    </motion.div>
  );
}
