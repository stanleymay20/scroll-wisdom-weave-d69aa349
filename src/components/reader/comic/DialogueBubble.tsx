/**
 * AGE-ADAPTIVE DIALOGUE BUBBLE
 * Styled speech bubbles that adapt to reader age group
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AgeGroup, DialogueData } from "./types";

interface DialogueBubbleProps {
  dialogue: DialogueData;
  index: number;
  ageGroup: AgeGroup;
  isHighlighted: boolean;
  isTTSEnabled: boolean;
  onSpeak?: () => void;
}

export function DialogueBubble({
  dialogue,
  index,
  ageGroup,
  isHighlighted,
  isTTSEnabled,
  onSpeak,
}: DialogueBubbleProps) {
  const getBubbleClasses = () => {
    const baseClasses = cn(
      "relative transition-all duration-300",
      isTTSEnabled && "cursor-pointer hover:scale-105"
    );

    // Age-adaptive sizing
    const sizeClasses = {
      children: "px-4 py-3 max-w-[320px] text-base",
      teen: "px-3 py-2 max-w-[280px] text-sm",
      adult: "px-3 py-2 max-w-[260px] text-sm",
    };

    // Age-adaptive rounding
    const roundingClasses = {
      children: "rounded-3xl",
      teen: "rounded-xl",
      adult: "rounded-lg",
    };

    // Highlight state
    const highlightClasses = isHighlighted
      ? "ring-2 ring-primary ring-offset-2 scale-105 z-10"
      : "";

    // Bubble type styles
    const typeClasses = getBubbleTypeClasses(dialogue.bubbleType, ageGroup);

    return cn(
      baseClasses,
      sizeClasses[ageGroup],
      roundingClasses[ageGroup],
      highlightClasses,
      typeClasses
    );
  };

  const getBubbleTypeClasses = (type: string, age: AgeGroup): string => {
    const isChild = age === 'children';
    
    switch (type) {
      case 'thought':
        return cn(
          "border-dashed italic",
          isChild 
            ? "bg-purple-100 dark:bg-purple-950 border-2 border-purple-300" 
            : "bg-muted/80 border border-muted-foreground/30"
        );
      case 'shout':
        return cn(
          "font-bold",
          isChild
            ? "bg-red-100 dark:bg-red-950 border-2 border-red-400"
            : "bg-destructive/20 border-2 border-destructive"
        );
      case 'whisper':
        return cn(
          isChild ? "text-sm" : "text-xs",
          "bg-muted/50 text-muted-foreground"
        );
      case 'narration':
        return cn(
          "text-center",
          isChild
            ? "bg-amber-100 dark:bg-amber-950 border border-amber-300"
            : "bg-foreground/10 border border-foreground/20"
        );
      default: // speech
        return cn(
          isChild
            ? "bg-white dark:bg-slate-800 border-2 border-slate-300 shadow-lg"
            : "bg-background border border-border shadow-md"
        );
    }
  };

  // Get character color for children mode (consistent per character)
  const getCharacterColor = (name: string): string => {
    const colors = [
      "text-blue-600",
      "text-green-600",
      "text-purple-600",
      "text-pink-600",
      "text-orange-600",
      "text-teal-600",
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Get bubble tail position (alternates)
  const tailPosition = index % 2 === 0 ? 'left' : 'right';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        delay: index * 0.1,
        type: ageGroup === 'children' ? 'spring' : 'tween',
        stiffness: 300,
        damping: 20,
      }}
      onClick={onSpeak}
      className={getBubbleClasses()}
    >
      {/* Speech bubble tail for children mode */}
      {ageGroup === 'children' && dialogue.bubbleType === 'speech' && (
        <div 
          className={cn(
            "absolute -bottom-2 w-4 h-4 bg-white dark:bg-slate-800 border-b-2 border-r-2 border-slate-300 rotate-45",
            tailPosition === 'left' ? "left-6" : "right-6"
          )}
        />
      )}

      {/* Character name */}
      <p className={cn(
        "font-medium mb-1",
        ageGroup === 'children' 
          ? cn("text-sm", getCharacterColor(dialogue.character))
          : "text-xs text-primary"
      )}>
        {ageGroup === 'children' && getCharacterEmoji(dialogue.character)}
        {dialogue.character}
      </p>

      {/* Speech content */}
      <p className={cn(
        ageGroup === 'children' && "leading-relaxed"
      )}>
        {ageGroup === 'children' ? formatChildFriendly(dialogue.speech) : dialogue.speech}
      </p>
    </motion.div>
  );
}

// Get emoji prefix for character (children mode)
function getCharacterEmoji(name: string): string {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('mom') || lowerName.includes('mother')) return '👩 ';
  if (lowerName.includes('dad') || lowerName.includes('father')) return '👨 ';
  if (lowerName.includes('grandma') || lowerName.includes('grandmother')) return '👵 ';
  if (lowerName.includes('grandpa') || lowerName.includes('grandfather')) return '👴 ';
  if (lowerName.includes('teacher')) return '🧑‍🏫 ';
  if (lowerName.includes('doctor')) return '👨‍⚕️ ';
  if (lowerName.includes('dog') || lowerName.includes('puppy')) return '🐕 ';
  if (lowerName.includes('cat') || lowerName.includes('kitten')) return '🐱 ';
  if (lowerName.includes('narrator')) return '📖 ';
  
  return '';
}

// Format text for child readability
function formatChildFriendly(text: string): string {
  // Add line breaks for very long sentences
  if (text.length > 60) {
    const midpoint = Math.floor(text.length / 2);
    const breakPoint = text.indexOf(' ', midpoint);
    if (breakPoint > 0) {
      return text.slice(0, breakPoint) + '\n' + text.slice(breakPoint + 1);
    }
  }
  return text;
}
