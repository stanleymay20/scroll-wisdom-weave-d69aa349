import { useState, useEffect, useRef, forwardRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { 
  Brain, 
  Lightbulb, 
  MessageCircle, 
  Pause, 
  CheckCircle2,
  ChevronRight,
  Star,
  Target,
  Eye,
  Lock,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { COGNITIVE_LEVELS, type CognitiveLevel } from "./CognitiveLevelSelector";

interface GuidedReadingModeProps {
  cognitiveLevel: string;
  currentProgress: number;
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
  const levelData = COGNITIVE_LEVELS.find(l => l.id === cognitiveLevel) || COGNITIVE_LEVELS[1];
  const Icon = levelData.icon;

  const estimatedMinutesLeft = Math.round(
    (wordCount * (1 - currentProgress / 100) / 200) * levelData.timeMultiplier
  );

  return (
    <>
      {/* Animated Progress Bar Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/80 backdrop-blur-sm border-b border-border/50 p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <motion.div 
            className="flex items-center gap-2"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <motion.div 
              className={cn("p-1.5 rounded-md", "bg-primary/10")}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className={cn("h-4 w-4", levelData.color)} />
            </motion.div>
            <div>
              <span className="text-sm font-medium">{levelData.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                Chapter {chapterNumber}/{totalChapters}
              </span>
            </div>
          </motion.div>
          <motion.div 
            className="flex items-center gap-3 text-sm"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-muted-foreground">
              ~{estimatedMinutesLeft} min left
            </span>
            <motion.span 
              className="font-mono text-primary"
              key={currentProgress}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
            >
              {Math.round(currentProgress)}%
            </motion.span>
          </motion.div>
        </div>
        
        {/* Animated Progress Bar */}
        <div className="relative">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-scroll-gold to-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${currentProgress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          
          {/* Milestone markers with animation */}
          <div className="relative h-2 -mt-2">
            {[25, 50, 75].map((point, index) => (
              <motion.div
                key={point}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: currentProgress >= point ? 1.2 : 1, 
                  opacity: 1 
                }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "absolute top-0 w-2 h-2 rounded-full transform -translate-x-1/2 transition-colors",
                  currentProgress >= point
                    ? "bg-primary shadow-[0_0_8px_rgba(218,165,32,0.5)]"
                    : "bg-muted-foreground/30"
                )}
                style={{ left: `${point}%` }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </>
  );
}

// Animated paragraph wrapper for guided reading
export function AnimatedParagraph({
  children,
  index,
  cognitiveLevel,
  isVisible = true
}: {
  children: React.ReactNode;
  index: number;
  cognitiveLevel: string;
  isVisible?: boolean;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  
  const levelData = COGNITIVE_LEVELS.find(l => l.id === cognitiveLevel) || COGNITIVE_LEVELS[1];
  
  // Different animation strategies based on cognitive level
  const getAnimationConfig = () => {
    switch (cognitiveLevel) {
      case "familiarisation":
        // Soft, gentle fade-in
        return {
          initial: { opacity: 0 },
          animate: { opacity: isInView && isVisible ? 1 : 0 },
          transition: { duration: 0.8, delay: index * 0.05 }
        };
      case "functional":
        // Chunked reveal with slight movement
        return {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: isInView && isVisible ? 1 : 0, y: isInView && isVisible ? 0 : 10 },
          transition: { duration: 0.5, delay: index * 0.08 }
        };
      case "applied":
        // More pronounced reveal with scale
        return {
          initial: { opacity: 0, y: 15, scale: 0.98 },
          animate: { 
            opacity: isInView && isVisible ? 1 : 0, 
            y: isInView && isVisible ? 0 : 15,
            scale: isInView && isVisible ? 1 : 0.98
          },
          transition: { duration: 0.6, delay: index * 0.1 }
        };
      case "analytical":
      case "mastery":
        // Deliberate, focused reveal with highlight effect
        return {
          initial: { opacity: 0, y: 20, filter: "blur(4px)" },
          animate: { 
            opacity: isInView && isVisible ? 1 : 0, 
            y: isInView && isVisible ? 0 : 20,
            filter: isInView && isVisible ? "blur(0px)" : "blur(4px)"
          },
          transition: { duration: 0.7, delay: index * 0.12 }
        };
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0.3 }
        };
    }
  };

  const config = getAnimationConfig();

  return (
    <motion.div
      ref={ref}
      initial={config.initial}
      animate={config.animate}
      transition={config.transition}
    >
      {children}
    </motion.div>
  );
}

// Reflection pause overlay for deep learning modes
export function ReflectionPause({
  isActive,
  onContinue,
  prompt
}: {
  isActive: boolean;
  onContinue: () => void;
  prompt: string;
}) {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center"
        >
          {/* Blur overlay */}
          <motion.div 
            className="absolute inset-0 bg-background/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          
          {/* Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative z-10 max-w-lg mx-4 p-8 bg-card rounded-2xl border border-border shadow-2xl text-center"
          >
            <motion.div
              className="inline-flex p-4 rounded-full bg-purple-500/20 mb-4"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Pause className="h-8 w-8 text-purple-400" />
            </motion.div>
            
            <h3 className="text-xl font-display font-bold mb-3">Reflection Pause</h3>
            <p className="text-muted-foreground mb-6">{prompt}</p>
            
            <Button onClick={onContinue} className="bg-purple-500 hover:bg-purple-600">
              <Eye className="h-4 w-4 mr-2" />
              Continue Reading
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Section lock for progression-based learning
export function SectionLock({
  isLocked,
  onUnlock,
  requirementText
}: {
  isLocked: boolean;
  onUnlock: () => void;
  requirementText: string;
}) {
  if (!isLocked) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-12 px-6 bg-muted/30 rounded-xl border border-border/50 my-6"
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="p-4 rounded-full bg-amber-500/20 mb-4"
      >
        <Lock className="h-6 w-6 text-amber-400" />
      </motion.div>
      <p className="text-sm text-muted-foreground text-center mb-4">{requirementText}</p>
      <Button variant="outline" onClick={onUnlock} size="sm">
        <Sparkles className="h-4 w-4 mr-2" />
        Mark as Understood
      </Button>
    </motion.div>
  );
}

// Floating indicator for current cognitive level - wrapped in forwardRef for AnimatePresence
export const CognitiveLevelIndicator = forwardRef<
  HTMLButtonElement,
  {
    level: string;
    progress: number;
    onClick?: () => void;
  }
>(function CognitiveLevelIndicator({ level, progress, onClick }, ref) {
  const levelData = COGNITIVE_LEVELS.find(l => l.id === level) || COGNITIVE_LEVELS[1];
  const Icon = levelData.icon;

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-full",
        "bg-card/80 backdrop-blur-sm border border-border/50",
        "hover:border-primary/50 transition-colors"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Icon className={cn("h-4 w-4", levelData.color)} />
      <span className="text-sm font-medium">{levelData.name}</span>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {Math.round(progress)}%
      </span>
    </motion.button>
  );
});
