/**
 * Reader Tools Bottom Sheet
 * 
 * PMF MODE: Only Quiz + Edit visible.
 * Voice AI, Flashcards, Learning Decks, Code Playground, Comic Mode hidden.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Mic,
  GraduationCap,
  MessageCircle,
  Code2,
  Presentation,
  BookOpen,
  Edit3,
  Layers,
  Sparkles,
  Video,
  X,
  Brain,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/config";

interface ToolAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "primary" | "accent";
  hidden?: boolean;
}

interface ReaderToolsSheetProps {
  isQuizUnlocked: boolean;
  quizProgress: number;
  hasCodeContent: boolean;
  hasComicContent: boolean;
  isBookOwner: boolean;
  onVoiceClick: () => void;
  onQuizClick: () => void;
  onQAClick: () => void;
  onPlaygroundClick: () => void;
  onComicModeClick: () => void;
  onEditClick: () => void;
  onLearningDeckClick: () => void;
  onFlashcardsClick: () => void;
  onVideoClick?: () => void;
  onKnowledgeGraphClick?: () => void;
  onStudyMusicClick?: () => void;
  /** Bottom offset for the FAB so it can stack above other floating elements (TTS player, etc.). Defaults to "calc(env(safe-area-inset-bottom) + 5rem)". */
  bottomOffset?: string;
}

export function ReaderToolsSheet({
  isQuizUnlocked,
  quizProgress,
  hasCodeContent,
  hasComicContent,
  isBookOwner,
  onVoiceClick,
  onQuizClick,
  onQAClick,
  onPlaygroundClick,
  onComicModeClick,
  onEditClick,
  onLearningDeckClick,
  onFlashcardsClick,
  onVideoClick,
  onKnowledgeGraphClick,
  onStudyMusicClick,
  bottomOffset,
}: ReaderToolsSheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tools: ToolAction[] = [
    {
      id: "voice",
      label: "Voice AI",
      icon: <Mic className="h-5 w-5" />,
      onClick: onVoiceClick,
      variant: "primary",
    },
    {
      id: "qa",
      label: "Ask AI",
      icon: <MessageCircle className="h-5 w-5" />,
      onClick: onQAClick,
      variant: "default",
    },
    {
      id: "quiz",
      label: isQuizUnlocked ? "Quiz" : `Quiz (${Math.round(quizProgress)}% read)`,
      icon: <GraduationCap className="h-5 w-5" />,
      onClick: onQuizClick,
      disabled: !isQuizUnlocked,
      disabledReason: `Read ${Math.max(0, 80 - quizProgress).toFixed(0)}% more to unlock`,
    },
    {
      id: "flashcards",
      label: "Flashcards",
      icon: <Layers className="h-5 w-5" />,
      onClick: onFlashcardsClick,
      hidden: !FEATURES.enableFlashcards,
    },
    {
      id: "deck",
      label: "Learning Deck",
      icon: <Presentation className="h-5 w-5" />,
      onClick: onLearningDeckClick,
      hidden: !FEATURES.enableLearningDecks,
    },
    {
      id: "playground",
      label: "Code Playground",
      icon: <Code2 className="h-5 w-5" />,
      onClick: onPlaygroundClick,
      hidden: !hasCodeContent || !FEATURES.enableCodePlayground,
    },
    {
      id: "comic",
      label: "Comic Mode",
      icon: <BookOpen className="h-5 w-5" />,
      onClick: onComicModeClick,
      hidden: !hasComicContent || !FEATURES.enableComicMode,
      variant: "accent",
    },
    {
      id: "edit",
      label: "Edit Chapter",
      icon: <Edit3 className="h-5 w-5" />,
      onClick: onEditClick,
      hidden: !isBookOwner,
    },
    {
      id: "video",
      label: "Chapter Video",
      icon: <Video className="h-5 w-5" />,
      onClick: onVideoClick || (() => {}),
      hidden: !FEATURES.enableChapterVideo,
      variant: "accent",
    },
    {
      id: "knowledge",
      label: "Knowledge Graph",
      icon: <Brain className="h-5 w-5" />,
      onClick: onKnowledgeGraphClick || (() => {}),
      hidden: !FEATURES.enableKnowledgeGraph,
      variant: "primary",
    },
    {
      id: "study-music",
      label: "Study Music",
      icon: <Music className="h-5 w-5" />,
      onClick: onStudyMusicClick || (() => {}),
    },
  ];

  const visibleTools = tools.filter((t) => !t.hidden);

  const handleToolClick = (tool: ToolAction) => {
    if (tool.disabled) return;
    setIsOpen(false);
    // Let the current sheet finish closing before opening a second modal/sheet.
    window.setTimeout(() => tool.onClick(), 280);
  };

  return (
    <>
      {/* Single minimal FAB */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed z-[60] w-12 h-12 rounded-full bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center backdrop-blur-sm hover:bg-primary transition-colors"
        style={{
          bottom: bottomOffset ?? "calc(env(safe-area-inset-bottom) + 5rem)",
          right: "max(1rem, env(safe-area-inset-right))",
        }}
        whileTap={{ scale: 0.9 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        title="Reader Tools"
      >
        <Sparkles className="h-5 w-5" />
      </motion.button>

      {/* Bottom Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 max-h-[70vh] flex flex-col">
          <SheetHeader className="pb-4 flex-none">
            <SheetTitle className="text-base font-semibold">Reader Tools</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              AI-powered study tools for this chapter
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto flex-1 min-h-0 pb-2">
            {visibleTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool)}
                disabled={tool.disabled}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-sm font-medium",
                  tool.disabled
                    ? "opacity-40 cursor-not-allowed border-border bg-muted/30 text-muted-foreground"
                    : tool.variant === "primary"
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50"
                    : tool.variant === "accent"
                    ? "border-accent/30 bg-accent/10 text-accent-foreground hover:bg-accent/20"
                    : "border-border bg-card hover:bg-muted/50 hover:border-border/80 text-foreground"
                )}
              >
                {tool.icon}
                <span className="text-xs leading-tight text-center">{tool.label}</span>
                {tool.disabled && tool.disabledReason && (
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {tool.disabledReason}
                  </span>
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
