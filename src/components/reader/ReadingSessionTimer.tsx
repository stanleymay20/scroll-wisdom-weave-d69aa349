/**
 * Reading Session Timer Component
 * 
 * Displays current session time and weekly progress with:
 * - Live timer display
 * - Weekly goal progress bar
 * - Goal adjustment controls
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Target, ChevronUp, ChevronDown, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ReadingSessionTimerProps {
  formattedTime: string;
  elapsedSeconds: number;
  weeklyProgress: {
    totalMinutes: number;
    goalMinutes: number;
    percentComplete: number;
    sessionsThisWeek: number;
  };
  onUpdateGoal: (minutes: number) => void;
  compact?: boolean;
}

export function ReadingSessionTimer({
  formattedTime,
  elapsedSeconds,
  weeklyProgress,
  onUpdateGoal,
  compact = false,
}: ReadingSessionTimerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState(weeklyProgress.goalMinutes);

  const handleSaveGoal = () => {
    onUpdateGoal(tempGoal);
    setEditingGoal(false);
  };

  const goalPresets = [30, 60, 120, 180, 300];

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
      >
        <Clock className="h-3.5 w-3.5" />
        <span>{formattedTime}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden",
        isExpanded ? "w-72" : "w-auto"
      )}
    >
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Session</p>
            <p className="font-mono font-semibold text-foreground">{formattedTime}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Mini progress indicator */}
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${weeklyProgress.percentComplete}%` }}
            />
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="p-4 space-y-4">
              {/* Weekly Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Weekly Goal</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {weeklyProgress.totalMinutes}/{weeklyProgress.goalMinutes} min
                  </span>
                </div>
                
                <Progress 
                  value={weeklyProgress.percentComplete} 
                  className="h-2"
                />

                {weeklyProgress.percentComplete >= 100 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2 text-xs text-primary"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    <span>Weekly goal achieved! 🎉</span>
                  </motion.div>
                )}

                <p className="text-xs text-muted-foreground">
                  {weeklyProgress.sessionsThisWeek} sessions this week
                </p>
              </div>

              {/* Goal Editor */}
              {editingGoal ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Set weekly reading goal (minutes):</p>
                  <div className="flex flex-wrap gap-1">
                    {goalPresets.map((preset) => (
                      <Button
                        key={preset}
                        size="sm"
                        variant={tempGoal === preset ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setTempGoal(preset)}
                      >
                        {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="flex-1 h-7" onClick={handleSaveGoal}>
                      Save
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7"
                      onClick={() => {
                        setTempGoal(weeklyProgress.goalMinutes);
                        setEditingGoal(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={() => setEditingGoal(true)}
                >
                  Adjust Goal
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
