/**
 * LEARNING HIGHLIGHT COMPONENT
 * Visual indicator for learning moments within comic panels
 */

import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, BookOpen, Sparkles, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { LearningMoment, AgeGroup } from "./types";

interface LearningHighlightProps {
  moment: LearningMoment;
  ageGroup: AgeGroup;
  isVisible: boolean;
  onDismiss?: () => void;
}

export function LearningHighlight({ 
  moment, 
  ageGroup, 
  isVisible,
  onDismiss 
}: LearningHighlightProps) {
  const getIcon = () => {
    switch (ageGroup) {
      case 'children':
        return <Sparkles className="h-5 w-5 text-amber-400" />;
      case 'teen':
        return <Lightbulb className="h-4 w-4 text-primary" />;
      default:
        return <Brain className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const containerClasses = cn(
    "absolute bottom-4 left-4 right-4 z-20",
    "backdrop-blur-md p-3 shadow-lg",
    ageGroup === 'children' 
      ? "bg-amber-50/95 dark:bg-amber-950/95 rounded-2xl border-2 border-amber-300" 
      : ageGroup === 'teen'
      ? "bg-primary/10 rounded-xl border border-primary/30"
      : "bg-muted/90 rounded-lg border border-border"
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ 
            type: ageGroup === 'children' ? 'spring' : 'tween',
            stiffness: 300,
            damping: 20,
          }}
          className={containerClasses}
          onClick={onDismiss}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              "flex-shrink-0 p-2 rounded-full",
              ageGroup === 'children' 
                ? "bg-amber-200 dark:bg-amber-800" 
                : "bg-primary/20"
            )}>
              {getIcon()}
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Learning objective */}
              <p className={cn(
                "font-medium mb-1",
                ageGroup === 'children' ? "text-base text-amber-900 dark:text-amber-100" : "text-sm"
              )}>
                {ageGroup === 'children' && "💡 "}{moment.objective}
              </p>
              
              {/* Concept explanation */}
              {moment.concept && (
                <p className={cn(
                  "text-muted-foreground",
                  ageGroup === 'children' ? "text-sm" : "text-xs"
                )}>
                  {moment.concept}
                </p>
              )}
              
              {/* Vocabulary */}
              {moment.vocabulary && moment.vocabulary.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {moment.vocabulary.map((word, idx) => (
                    <span 
                      key={idx}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        ageGroup === 'children'
                          ? "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100"
                          : "bg-primary/20 text-primary"
                      )}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Badge for children */}
            {ageGroup === 'children' && (
              <motion.div
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="flex-shrink-0"
              >
                <BookOpen className="h-6 w-6 text-amber-500" />
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Mini badge that shows in panel corner
export function LearningBadge({ ageGroup }: { ageGroup: AgeGroup }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      className={cn(
        "absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1",
        ageGroup === 'children'
          ? "bg-amber-400 text-amber-900 rounded-full shadow-lg"
          : ageGroup === 'teen'
          ? "bg-primary text-primary-foreground rounded-lg"
          : "bg-muted text-muted-foreground rounded-md"
      )}
    >
      {ageGroup === 'children' ? (
        <>
          <Sparkles className="h-3 w-3" />
          <span className="text-xs font-bold">Learn!</span>
        </>
      ) : (
        <Lightbulb className="h-3 w-3" />
      )}
    </motion.div>
  );
}
