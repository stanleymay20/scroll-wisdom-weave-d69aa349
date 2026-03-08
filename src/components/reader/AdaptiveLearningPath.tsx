/**
 * Adaptive Learning Path Panel
 * 
 * Shows personalized difficulty recommendations based on quiz history.
 * Visualizes the learner's trajectory and suggests next steps.
 */

import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Brain,
  Zap,
  AlertTriangle,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAdaptiveDifficulty } from '@/hooks/useAdaptiveDifficulty';
import { getDifficultyLabel } from '@/lib/adaptiveDifficulty';

interface AdaptiveLearningPathProps {
  userId?: string | null;
  bookId: string;
  chapterId?: string;
  onStartQuiz?: (difficulty: number) => void;
}

export function AdaptiveLearningPath({ userId, bookId, chapterId, onStartQuiz }: AdaptiveLearningPathProps) {
  const { recommendation, history, isLoading } = useAdaptiveDifficulty({ userId, bookId, chapterId });

  if (isLoading || !recommendation) return null;

  const diffLabel = getDifficultyLabel(recommendation.recommendedDifficulty);
  const hasHistory = history.length > 0;
  const recentScores = history.slice(-5).map(h => h.score);
  const avgScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm text-foreground">Adaptive Path</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {hasHistory ? `${history.length} attempts` : 'New'}
        </Badge>
      </div>

      {/* Recommended Difficulty */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold",
          recommendation.shouldEscalate && "bg-emerald-500/15 text-emerald-600",
          recommendation.shouldDeescalate && "bg-amber-500/15 text-amber-600",
          !recommendation.shouldEscalate && !recommendation.shouldDeescalate && "bg-primary/10 text-primary",
        )}>
          {recommendation.recommendedDifficulty}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground">{diffLabel}</span>
            {recommendation.shouldEscalate && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
            {recommendation.shouldDeescalate && <TrendingDown className="h-3.5 w-3.5 text-amber-500" />}
            {!recommendation.shouldEscalate && !recommendation.shouldDeescalate && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground truncate">{recommendation.reason}</p>
        </div>
      </div>

      {/* Score Sparkline */}
      {recentScores.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Recent scores</span>
            <span>Avg: {avgScore}%</span>
          </div>
          <div className="flex items-end gap-1 h-8">
            {recentScores.map((score, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t transition-all",
                  score >= 80 ? "bg-emerald-500/60" :
                  score >= 60 ? "bg-primary/50" :
                  score >= 40 ? "bg-amber-500/50" : "bg-destructive/40",
                )}
                style={{ height: `${Math.max(10, score)}%` }}
                title={`${Math.round(score)}%`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bloom Level */}
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Target:</span>
        <Badge variant="secondary" className="text-xs capitalize">
          {recommendation.recommendedBloomLevel}
        </Badge>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Confidence: {Math.round(recommendation.confidence * 100)}%
        </span>
      </div>

      {/* Confidence bar */}
      <Progress value={recommendation.confidence * 100} className="h-1.5" />

      {/* Focus Areas */}
      {recommendation.focusAreas.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Focus areas
          </span>
          <div className="flex flex-wrap gap-1">
            {recommendation.focusAreas.map((area, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      {onStartQuiz && (
        <button
          onClick={() => onStartQuiz(recommendation.recommendedDifficulty)}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors",
            "bg-primary/10 hover:bg-primary/20 text-primary",
          )}
        >
          <Zap className="h-4 w-4" />
          Start Adaptive Quiz
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}
