/**
 * COMIC PANEL VIEW
 * Renders a single comic panel with age-adaptive styling
 */

import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComicPanelData, AgeAdaptiveConfig } from "./types";
import { DialogueBubble } from "./DialogueBubble";
import { LearningHighlight, LearningBadge } from "./LearningHighlight";
import { useState } from "react";

interface PanelViewProps {
  panel: ComicPanelData;
  config: AgeAdaptiveConfig;
  isTTSEnabled: boolean;
  highlightedDialogue: number | null;
  onSpeakDialogue?: (index: number) => void;
  showLearningMoment?: boolean;
}

export function PanelView({
  panel,
  config,
  isTTSEnabled,
  highlightedDialogue,
  onSpeakDialogue,
  showLearningMoment = true,
}: PanelViewProps) {
  const [learningDismissed, setLearningDismissed] = useState(false);
  const hasLearningMoment = panel.learningMoment && showLearningMoment;

  // Image container classes based on age
  const getImageContainerClasses = () => {
    switch (config.ageGroup) {
      case 'children':
        return "rounded-3xl border-4 border-amber-200 dark:border-amber-800 shadow-2xl overflow-hidden";
      case 'teen':
        return "rounded-2xl border-2 border-border shadow-xl overflow-hidden";
      default:
        return "rounded-lg border border-border shadow-lg overflow-hidden";
    }
  };

  // Placeholder styling
  const getPlaceholderClasses = () => {
    switch (config.ageGroup) {
      case 'children':
        return "bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900 dark:to-orange-900";
      case 'teen':
        return "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900";
      default:
        return "bg-muted";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 h-full">
      {/* Panel Image */}
      <div className={cn(
        "relative max-w-3xl w-full",
        config.ageGroup === 'children' ? "max-h-[55vh]" : "max-h-[60vh]"
      )}>
        {/* Learning badge */}
        {hasLearningMoment && config.showLearningBadges && !learningDismissed && (
          <LearningBadge ageGroup={config.ageGroup} />
        )}

        {/* Image or placeholder */}
        <div className={getImageContainerClasses()}>
          {panel.imageUrl ? (
            <motion.img
              src={panel.imageUrl}
              alt={`Panel ${panel.panelNumber}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full object-contain"
              style={{ maxHeight: config.ageGroup === 'children' ? '50vh' : '55vh' }}
            />
          ) : (
            <div className={cn(
              "w-full aspect-[4/3] flex items-center justify-center",
              getPlaceholderClasses()
            )}>
              <div className="text-center p-6">
                {config.ageGroup === 'children' ? (
                  <>
                    <Sparkles className="h-16 w-16 text-amber-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-amber-700 dark:text-amber-300 max-w-md">
                      {panel.visualDescription}
                    </p>
                  </>
                ) : (
                  <>
                    <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground max-w-md">
                      {panel.visualDescription}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Learning highlight overlay */}
        {hasLearningMoment && !learningDismissed && (
          <LearningHighlight
            moment={panel.learningMoment!}
            ageGroup={config.ageGroup}
            isVisible={!learningDismissed}
            onDismiss={() => setLearningDismissed(true)}
          />
        )}
      </div>

      {/* Caption */}
      <AnimatePresence>
        {panel.caption && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "mt-4 text-center max-w-lg italic",
              config.ageGroup === 'children'
                ? "px-6 py-3 bg-amber-50 dark:bg-amber-950 rounded-2xl text-base"
                : "px-4 py-2 bg-foreground/5 rounded-lg text-sm"
            )}
          >
            {config.ageGroup === 'children' && "📖 "}
            {panel.caption}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogue Bubbles */}
      <div className={cn(
        "mt-4 flex flex-wrap justify-center",
        config.ageGroup === 'children' ? "gap-4" : "gap-3",
        "max-w-2xl"
      )}>
        {panel.dialogues?.map((dialogue, idx) => (
          <DialogueBubble
            key={idx}
            dialogue={dialogue}
            index={idx}
            ageGroup={config.ageGroup}
            isHighlighted={highlightedDialogue === idx}
            isTTSEnabled={isTTSEnabled}
            onSpeak={() => onSpeakDialogue?.(idx)}
          />
        ))}
      </div>
    </div>
  );
}
