/**
 * CuriosityGap — Section ending cliffhanger prompt
 * Shown at end of sections to pull users forward
 */

import { motion } from "framer-motion";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCuriosityGap } from "@/lib/gamificationEngine";

interface CuriosityGapProps {
  onContinue: () => void;
  sectionNumber?: number;
  totalSections?: number;
  className?: string;
}

export function CuriosityGap({ onContinue, sectionNumber = 1, totalSections, className }: CuriosityGapProps) {
  const message = getCuriosityGap();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={`my-8 p-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-primary/10 shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground/90 italic mb-3">
            "{message}"
          </p>
          
          {totalSections && (
            <div className="flex items-center gap-2 mb-3">
              {Array.from({ length: totalSections }, (_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < sectionNumber ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onContinue}
            className="gap-2 text-primary hover:text-primary hover:bg-primary/10"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * SectionLock — Progressive disclosure indicator
 */
interface SectionLockProps {
  sectionNumber: number;
  isLocked?: boolean;
}

export function SectionLock({ sectionNumber, isLocked = true }: SectionLockProps) {
  if (!isLocked) return null;
  
  return (
    <div className="my-6 p-4 rounded-xl border border-border/50 bg-muted/30 flex items-center gap-3 opacity-60">
      <Lock className="h-4 w-4 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Section {sectionNumber} — Complete the current section to unlock
      </p>
    </div>
  );
}
