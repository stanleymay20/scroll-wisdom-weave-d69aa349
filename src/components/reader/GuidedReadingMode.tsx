import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Brain, 
  Lightbulb, 
  MessageCircle, 
  Pause, 
  CheckCircle2,
  ChevronRight,
  Star,
  Target,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { COGNITIVE_LEVELS, type CognitiveLevel } from "./CognitiveLevelSelector";

interface GuidedReadingModeProps {
  cognitiveLevel: string;
  currentProgress: number; // 0-100
  chapterNumber: number;
  totalChapters: number;
  wordCount: number;
  onDismiss?: () => void;
}

interface CognitiveFeedback {
  type: "milestone" | "reflection" | "encouragement" | "checkpoint";
  title: string;
  message: string;
  icon: typeof Brain;
}

// Generate contextual feedback based on progress and cognitive level
function generateFeedback(
  level: CognitiveLevel,
  progress: number,
  chapterNumber: number
): CognitiveFeedback | null {
  // Milestone feedback at specific progress points
  if (progress === 25) {
    return {
      type: "milestone",
      title: "Great start!",
      message: "You've completed 25% of this chapter. Keep building momentum.",
      icon: Star
    };
  }
  
  if (progress === 50) {
    if (level.id === "analytical" || level.id === "mastery") {
      return {
        type: "reflection",
        title: "Reflective Pause",
        message: "You're halfway through. Take a moment to consider: What key arguments or insights have you encountered? How do they connect to what you already know?",
        icon: Brain
      };
    }
    return {
      type: "milestone",
      title: "Halfway there!",
      message: "You've reached the midpoint. The concepts are building on each other.",
      icon: Target
    };
  }
  
  if (progress === 75) {
    if (level.id === "applied" || level.id === "analytical" || level.id === "mastery") {
      return {
        type: "checkpoint",
        title: "Application Checkpoint",
        message: "Consider how you might apply what you've learned in this chapter to real situations. What practical insights can you extract?",
        icon: Lightbulb
      };
    }
    return {
      type: "encouragement",
      title: "Almost there!",
      message: "You're making excellent progress. The final section often contains key conclusions.",
      icon: CheckCircle2
    };
  }
  
  if (progress >= 95) {
    return {
      type: "milestone",
      title: "Chapter Complete!",
      message: `Excellent work completing Chapter ${chapterNumber}! You've demonstrated strong commitment to your learning journey.`,
      icon: Star
    };
  }
  
  return null;
}

export function GuidedReadingMode({
  cognitiveLevel,
  currentProgress,
  chapterNumber,
  totalChapters,
  wordCount,
  onDismiss
}: GuidedReadingModeProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<CognitiveFeedback | null>(null);
  const [acknowledgedMilestones, setAcknowledgedMilestones] = useState<number[]>([]);

  const levelData = COGNITIVE_LEVELS.find(l => l.id === cognitiveLevel) || COGNITIVE_LEVELS[1];
  const Icon = levelData.icon;

  // Check for feedback triggers
  useEffect(() => {
    const milestonePoints = [25, 50, 75, 95];
    const currentMilestone = milestonePoints.find(
      point => currentProgress >= point && currentProgress < point + 5 && !acknowledgedMilestones.includes(point)
    );

    if (currentMilestone) {
      const feedback = generateFeedback(levelData, currentMilestone, chapterNumber);
      if (feedback) {
        setCurrentFeedback(feedback);
        setShowFeedback(true);
      }
    }
  }, [currentProgress, levelData, chapterNumber, acknowledgedMilestones]);

  const acknowledgeFeedback = () => {
    const milestonePoints = [25, 50, 75, 95];
    const acknowledged = milestonePoints.filter(p => currentProgress >= p);
    setAcknowledgedMilestones(acknowledged);
    setShowFeedback(false);
  };

  const estimatedMinutesLeft = Math.round(
    (wordCount * (1 - currentProgress / 100) / 200) * levelData.timeMultiplier
  );

  return (
    <>
      {/* Progress Bar Header */}
      <div className="bg-card/80 backdrop-blur-sm border-b border-border/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md", "bg-scroll-gold/10")}>
              <Icon className={cn("h-4 w-4", levelData.color)} />
            </div>
            <div>
              <span className="text-sm font-medium">{levelData.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                Chapter {chapterNumber}/{totalChapters}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              ~{estimatedMinutesLeft} min left
            </span>
            <span className="font-mono text-scroll-gold">
              {Math.round(currentProgress)}%
            </span>
          </div>
        </div>
        <Progress value={currentProgress} className="h-1.5" />
        
        {/* Milestone markers */}
        <div className="relative h-2 -mt-2">
          {[25, 50, 75].map(point => (
            <div
              key={point}
              className={cn(
                "absolute top-0 w-1.5 h-1.5 rounded-full transform -translate-x-1/2",
                currentProgress >= point
                  ? "bg-scroll-gold"
                  : "bg-muted-foreground/30"
              )}
              style={{ left: `${point}%` }}
            />
          ))}
        </div>
      </div>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedback && currentFeedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-card rounded-xl border border-border shadow-xl max-w-md w-full p-6"
            >
              <div className="text-center">
                <div className={cn(
                  "inline-flex p-4 rounded-full mb-4",
                  currentFeedback.type === "milestone" && "bg-scroll-gold/20",
                  currentFeedback.type === "reflection" && "bg-purple-500/20",
                  currentFeedback.type === "checkpoint" && "bg-amber-500/20",
                  currentFeedback.type === "encouragement" && "bg-green-500/20"
                )}>
                  <currentFeedback.icon className={cn(
                    "h-8 w-8",
                    currentFeedback.type === "milestone" && "text-scroll-gold",
                    currentFeedback.type === "reflection" && "text-purple-400",
                    currentFeedback.type === "checkpoint" && "text-amber-400",
                    currentFeedback.type === "encouragement" && "text-green-400"
                  )} />
                </div>
                
                <h3 className="text-xl font-display font-bold mb-2">
                  {currentFeedback.title}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {currentFeedback.message}
                </p>

                <div className="flex gap-3 justify-center">
                  {currentFeedback.type === "reflection" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Could open a note-taking modal
                        acknowledgeFeedback();
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Add Note
                    </Button>
                  )}
                  <Button
                    onClick={acknowledgeFeedback}
                    className="bg-scroll-gold hover:bg-scroll-gold/90 text-scroll-dark"
                  >
                    Continue Reading
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Floating indicator for current cognitive level
export function CognitiveLevelIndicator({
  level,
  progress,
  onClick
}: {
  level: string;
  progress: number;
  onClick?: () => void;
}) {
  const levelData = COGNITIVE_LEVELS.find(l => l.id === level) || COGNITIVE_LEVELS[1];
  const Icon = levelData.icon;

  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-full",
        "bg-card/80 backdrop-blur-sm border border-border/50",
        "hover:border-scroll-gold/50 transition-colors"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Icon className={cn("h-4 w-4", levelData.color)} />
      <span className="text-sm font-medium">{levelData.name}</span>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-scroll-gold rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {Math.round(progress)}%
      </span>
    </motion.button>
  );
}
