/**
 * CuriosityGap v2 — Context-aware section cliffhanger
 * Uses reading progress for contextual messages, animated progress dots
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Lock, Sparkles, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCuriosityGap } from "@/lib/gamificationEngine";

interface CuriosityGapProps {
  onContinue: () => void;
  sectionNumber?: number;
  totalSections?: number;
  readingProgress?: number;
  className?: string;
}

export function CuriosityGap({ onContinue, sectionNumber = 1, totalSections, readingProgress = 50, className }: CuriosityGapProps) {
  const message = useMemo(() => getCuriosityGap(readingProgress), [readingProgress]);
  const progressPercent = totalSections ? Math.round((sectionNumber / totalSections) * 100) : 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 25 }}
      className={`my-8 p-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <motion.div 
          className="p-2 rounded-full bg-primary/10 shrink-0 mt-0.5"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          <Brain className="h-4 w-4 text-primary" />
        </motion.div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground/90 italic mb-3 leading-relaxed">
            "{message}"
          </p>
          
          {/* Animated progress dots */}
          {totalSections && totalSections > 1 && (
            <div className="flex items-center gap-1.5 mb-3">
              {Array.from({ length: totalSections }, (_, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ 
                    backgroundColor: i < sectionNumber ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                    scale: i === sectionNumber ? [1, 1.3, 1] : 1,
                  }}
                  transition={{ duration: 0.3, scale: { repeat: Infinity, duration: 1.5 } }}
                  className="h-1.5 flex-1 rounded-full"
                />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">{progressPercent}%</span>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onContinue}
            className="gap-2 text-primary hover:text-primary hover:bg-primary/10 font-medium"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * SectionLock v2 — Progressive disclosure lock with peek preview
 */
interface SectionLockProps {
  sectionNumber: number;
  sectionTitle?: string;
  isLocked?: boolean;
  estimatedMinutes?: number;
}

export function SectionLock({ sectionNumber, sectionTitle, isLocked = true, estimatedMinutes }: SectionLockProps) {
  if (!isLocked) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="my-6 p-4 rounded-xl border border-border/40 bg-muted/20 flex items-center gap-3"
    >
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground font-medium truncate">
          {sectionTitle || `Section ${sectionNumber}`}
        </p>
        <p className="text-xs text-muted-foreground/60">
          Complete the current section to unlock
          {estimatedMinutes ? ` · ~${estimatedMinutes} min` : ''}
        </p>
      </div>
    </motion.div>
  );
}
