/**
 * SectionCompleteCard — Micro-completion feedback
 * Shows after each section with XP reward and next prompt
 */

import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionCompleteCardProps {
  sectionNumber: number;
  xpEarned: number;
  onNext: () => void;
  nextSectionTitle?: string;
}

export function SectionCompleteCard({ sectionNumber, xpEarned, onNext, nextSectionTitle }: SectionCompleteCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="my-6 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5"
    >
      <div className="flex items-center gap-3 mb-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, delay: 0.1 }}
        >
          <CheckCircle className="h-6 w-6 text-emerald-500" />
        </motion.div>
        <div>
          <p className="font-semibold text-foreground">Section {sectionNumber} Complete</p>
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <Zap className="h-3 w-3" />
            <span>+{xpEarned} XP</span>
          </div>
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        className="w-full gap-2 text-primary hover:bg-primary/10"
      >
        {nextSectionTitle ? `Next: ${nextSectionTitle}` : "Next insight unlocked"} <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}
