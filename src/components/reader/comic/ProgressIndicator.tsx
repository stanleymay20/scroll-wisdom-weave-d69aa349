/**
 * AGE-ADAPTIVE PROGRESS INDICATOR
 * Shows reading progress in different styles based on age group
 */

import { motion } from "framer-motion";
import { Star, Circle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgeGroup, AgeAdaptiveConfig } from "./types";

interface ProgressIndicatorProps {
  current: number;
  total: number;
  config: AgeAdaptiveConfig;
  onNavigate?: (index: number) => void;
}

export function ProgressIndicator({ 
  current, 
  total, 
  config,
  onNavigate 
}: ProgressIndicatorProps) {
  const progress = ((current + 1) / total) * 100;

  if (config.progressStyle === 'stars') {
    return <StarProgress current={current} total={total} onNavigate={onNavigate} />;
  }

  if (config.progressStyle === 'dots') {
    return <DotProgress current={current} total={total} onNavigate={onNavigate} />;
  }

  return <BarProgress progress={progress} current={current} total={total} />;
}

// Star-based progress for children
function StarProgress({ 
  current, 
  total, 
  onNavigate 
}: { 
  current: number; 
  total: number; 
  onNavigate?: (index: number) => void;
}) {
  // Show max 7 stars, compress if more panels
  const displayCount = Math.min(total, 7);
  const step = total <= 7 ? 1 : total / 7;
  
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {Array.from({ length: displayCount }).map((_, idx) => {
        const panelIdx = Math.floor(idx * step);
        const isCompleted = panelIdx <= current;
        const isCurrent = Math.floor(current / step) === idx;
        
        return (
          <motion.button
            key={idx}
            onClick={() => onNavigate?.(panelIdx)}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            className="focus:outline-none"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-all",
                isCompleted 
                  ? "fill-amber-400 text-amber-400" 
                  : "fill-none text-muted-foreground/30",
                isCurrent && "scale-125"
              )}
            />
          </motion.button>
        );
      })}
      <span className="ml-2 text-sm font-medium text-muted-foreground">
        {current + 1}/{total}
      </span>
    </div>
  );
}

// Dot-based progress for teens
function DotProgress({ 
  current, 
  total, 
  onNavigate 
}: { 
  current: number; 
  total: number; 
  onNavigate?: (index: number) => void;
}) {
  // Show max 10 dots
  const displayCount = Math.min(total, 10);
  const step = total <= 10 ? 1 : total / 10;
  
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {Array.from({ length: displayCount }).map((_, idx) => {
        const panelIdx = Math.floor(idx * step);
        const isCompleted = panelIdx <= current;
        const isCurrent = Math.floor(current / step) === idx;
        
        return (
          <motion.button
            key={idx}
            onClick={() => onNavigate?.(panelIdx)}
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 0.8 }}
            className={cn(
              "rounded-full transition-all focus:outline-none",
              isCurrent 
                ? "w-6 h-2 bg-primary" 
                : isCompleted 
                ? "w-2 h-2 bg-primary"
                : "w-2 h-2 bg-muted-foreground/30"
            )}
          />
        );
      })}
    </div>
  );
}

// Bar-based progress for adults
function BarProgress({ 
  progress, 
  current, 
  total 
}: { 
  progress: number; 
  current: number; 
  total: number;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-4">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-1">
        Panel {current + 1} of {total}
      </p>
    </div>
  );
}

// Certification progress overlay
interface CertificationProgressProps {
  objectivesCompleted: number;
  objectivesTotal: number;
  quizScore?: number;
  isEligible: boolean;
  ageGroup: AgeGroup;
}

export function CertificationProgressOverlay({
  objectivesCompleted,
  objectivesTotal,
  quizScore,
  isEligible,
  ageGroup,
}: CertificationProgressProps) {
  const completionPercent = Math.round((objectivesCompleted / objectivesTotal) * 100);
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "absolute top-20 right-4 z-20 p-3 backdrop-blur-md shadow-lg",
        ageGroup === 'children'
          ? "bg-green-50/90 dark:bg-green-950/90 rounded-2xl border-2 border-green-300"
          : "bg-background/90 rounded-lg border border-border"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {isEligible ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn(
          "font-medium",
          ageGroup === 'children' ? "text-sm" : "text-xs"
        )}>
          {ageGroup === 'children' ? "🏆 Your Progress" : "Learning Progress"}
        </span>
      </div>
      
      {/* Objectives */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Objectives</span>
          <span className="font-medium">{objectivesCompleted}/{objectivesTotal}</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>
      
      {/* Quiz score if available */}
      {quizScore !== undefined && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quiz Score</span>
            <span className={cn(
              "font-medium",
              quizScore >= 70 ? "text-green-500" : "text-amber-500"
            )}>
              {quizScore}%
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
