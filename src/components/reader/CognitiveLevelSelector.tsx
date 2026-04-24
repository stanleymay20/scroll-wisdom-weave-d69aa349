import { useState, forwardRef } from "react";
import { motion } from "framer-motion";
import { 
  Brain, 
  Eye, 
  Target, 
  Lightbulb, 
  Trophy,
  Clock,
  CheckCircle2,
  ChevronRight,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAccessGate } from "@/hooks/useAccessGate";
import { UsageGateModal } from "@/components/subscription/UsageGateModal";

export interface CognitiveLevel {
  id: string;
  name: string;
  description: string;
  icon: typeof Brain;
  timeMultiplier: number;
  color: string;
  features: string[];
}

export const COGNITIVE_LEVELS: CognitiveLevel[] = [
  {
    id: "familiarisation",
    name: "Familiarisation",
    description: "Light engagement for overview and key concepts",
    icon: Eye,
    timeMultiplier: 0.5,
    color: "text-blue-400",
    features: [
      "Skim reading mode",
      "Key concepts highlighted",
      "Quick chapter summaries"
    ]
  },
  {
    id: "functional",
    name: "Functional Understanding",
    description: "Moderate engagement for practical knowledge",
    icon: Target,
    timeMultiplier: 1.0,
    color: "text-green-400",
    features: [
      "Full chapter reading",
      "Comprehension checkpoints",
      "Practical takeaways"
    ]
  },
  {
    id: "applied",
    name: "Applied Understanding",
    description: "Deep comprehension with real-world application",
    icon: Lightbulb,
    timeMultiplier: 1.5,
    color: "text-amber-400",
    features: [
      "Reflection prompts",
      "Application exercises",
      "Connection mapping"
    ]
  },
  {
    id: "analytical",
    name: "Analytical/Critical Understanding",
    description: "Intense engagement with critical analysis",
    icon: Brain,
    timeMultiplier: 2.0,
    color: "text-purple-400",
    features: [
      "Critical thinking prompts",
      "Cross-referencing",
      "Argument evaluation"
    ]
  },
  {
    id: "mastery",
    name: "Mastery Orientation",
    description: "Expert-level deep study and internalization",
    icon: Trophy,
    timeMultiplier: 3.0,
    color: "text-primary",
    features: [
      "Teaching preparation",
      "Synthesis activities",
      "Mastery assessments"
    ]
  }
];

export const DEFAULT_COGNITIVE_LEVEL_ID = "functional";

export function getCognitiveLevel(levelId?: string): CognitiveLevel {
  return (
    COGNITIVE_LEVELS.find((level) => level.id === levelId) ??
    COGNITIVE_LEVELS.find((level) => level.id === DEFAULT_COGNITIVE_LEVEL_ID) ??
    COGNITIVE_LEVELS[0]
  );
}

interface CognitiveLevelSelectorProps {
  selectedLevel: string;
  onSelectLevel: (levelId: string) => void;
  estimatedReadingTime: number; // in minutes for functional level
  onStartReading?: () => void;
}

const ADVANCED_LEVEL_IDS = new Set(["applied", "analytical", "mastery"]);

export const CognitiveLevelSelector = forwardRef<HTMLDivElement, CognitiveLevelSelectorProps>(function CognitiveLevelSelector({ 
  selectedLevel, 
  onSelectLevel, 
  estimatedReadingTime,
  onStartReading 
}, ref) {
  const [expanded, setExpanded] = useState(false);
  const { check, modal } = useAccessGate();

  const calculateTime = (multiplier: number) => {
    const totalMinutes = Math.round(estimatedReadingTime * multiplier);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const selectedLevelData = getCognitiveLevel(selectedLevel);

  const handleSelectLevel = (levelId: string) => {
    if (ADVANCED_LEVEL_IDS.has(levelId)) {
      const result = check("learning_mode_advanced", { source: "cognitive-level-selector" });
      if (!result.allowed) {
        modal.trigger(result);
        return;
      }
    }
    onSelectLevel(levelId);
  };

  return (
    <div ref={ref} className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Learning Mode</h3>
              <p className="text-xs text-muted-foreground">Select your depth of engagement</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      {/* Level Selection */}
      <div className={cn(
        "transition-all duration-300",
        expanded ? "max-h-[600px]" : "max-h-[200px]"
      )}>
        <div className="p-4 space-y-2">
          {COGNITIVE_LEVELS.map((level, index) => {
            const Icon = level.icon;
            const isSelected = selectedLevel === level.id;
            const isAdvanced = ADVANCED_LEVEL_IDS.has(level.id);
            const isLocked = isAdvanced && !check("learning_mode_advanced").allowed;
            
            return (
              <motion.button
                key={level.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleSelectLevel(level.id)}
                className={cn(
                  "w-full p-3 rounded-lg text-left transition-all",
                  "border hover:border-primary/50",
                  isSelected 
                    ? "bg-primary/10 border-primary/50" 
                    : "bg-muted/30 border-border/50",
                  isLocked && "opacity-80"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected ? "bg-primary/20" : "bg-muted"
                    )}>
                      <Icon className={cn("h-4 w-4", level.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{level.name}</span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Lock className="h-3 w-3" /> Premium
                          </span>
                        )}
                      </div>
                      {expanded && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {level.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn(
                      "font-mono",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}>
                      {calculateTime(level.timeMultiplier)}
                    </span>
                  </div>
                </div>

                {/* Features (shown when expanded and selected) */}
                {expanded && isSelected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 pt-3 border-t border-border/50"
                  >
                    <div className="space-y-1.5">
                      {level.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <ChevronRight className="h-3 w-3 text-primary" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Footer with Selected Summary */}
      {selectedLevelData && (
        <div className="p-4 border-t border-border/50 bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-shrink">
              <p className="text-sm truncate">
                <span className="text-muted-foreground">Mode: </span>
                <span className="font-medium text-foreground">
                  {selectedLevelData.id === "analytical" ? "Analytical" : selectedLevelData.name}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                ~{calculateTime(selectedLevelData.timeMultiplier)}
              </p>
            </div>
            {onStartReading && (
              <Button 
                onClick={onStartReading}
                className="bg-primary hover:bg-primary/90 text-scroll-dark flex-shrink-0"
                size="sm"
              >
                Start
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
