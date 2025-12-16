import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Brain, 
  Eye, 
  Target, 
  Lightbulb, 
  Trophy,
  Clock,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    color: "text-scroll-gold",
    features: [
      "Teaching preparation",
      "Synthesis activities",
      "Mastery assessments"
    ]
  }
];

interface CognitiveLevelSelectorProps {
  selectedLevel: string;
  onSelectLevel: (levelId: string) => void;
  estimatedReadingTime: number; // in minutes for functional level
  onStartReading?: () => void;
}

export function CognitiveLevelSelector({ 
  selectedLevel, 
  onSelectLevel, 
  estimatedReadingTime,
  onStartReading 
}: CognitiveLevelSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  const calculateTime = (multiplier: number) => {
    const totalMinutes = Math.round(estimatedReadingTime * multiplier);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const selectedLevelData = COGNITIVE_LEVELS.find(l => l.id === selectedLevel);

  return (
    <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-scroll-gold/10">
              <Brain className="h-5 w-5 text-scroll-gold" />
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
            
            return (
              <motion.button
                key={level.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => onSelectLevel(level.id)}
                className={cn(
                  "w-full p-3 rounded-lg text-left transition-all",
                  "border hover:border-scroll-gold/50",
                  isSelected 
                    ? "bg-scroll-gold/10 border-scroll-gold/50" 
                    : "bg-muted/30 border-border/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected ? "bg-scroll-gold/20" : "bg-muted"
                    )}>
                      <Icon className={cn("h-4 w-4", level.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{level.name}</span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-scroll-gold" />
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
                      isSelected ? "text-scroll-gold" : "text-muted-foreground"
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
                          <ChevronRight className="h-3 w-3 text-scroll-gold" />
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">
                <span className="text-muted-foreground">Selected: </span>
                <span className="font-medium text-foreground">{selectedLevelData.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Estimated time: {calculateTime(selectedLevelData.timeMultiplier)}
              </p>
            </div>
            {onStartReading && (
              <Button 
                onClick={onStartReading}
                className="bg-scroll-gold hover:bg-scroll-gold/90 text-scroll-dark"
              >
                Start Reading
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
