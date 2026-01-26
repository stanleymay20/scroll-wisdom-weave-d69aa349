/**
 * Floating Actions Component
 * 
 * Fixed mobile-safe floating action buttons for reader.
 * Uses a collapsed FAB pattern to prevent overlap with content.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  MessageCircle, 
  GraduationCap, 
  Code2, 
  BookOpen, 
  Presentation,
  ChevronUp,
  ChevronDown,
  X
} from "lucide-react";
import { LearningDeckGenerator } from "@/components/decks";
import { VoiceConversationButton } from "@/components/reader/VoiceConversation";
import { QuizModeButton } from "@/components/reader/QuizMode";
import { InteractiveQAButton } from "@/components/reader/InteractiveQA";

interface FloatingActionsProps {
  bookId: string;
  bookTitle: string;
  userId: string | null;
  totalChapters: number;
  currentChapter: number;
  cognitiveLevel: string;
  hasCodeContent: boolean;
  hasComicContent: boolean;
  isQuizUnlocked: boolean;
  quizProgress: number;
  onVoiceClick: () => void;
  onQuizClick: () => void;
  onQAClick: () => void;
  onPlaygroundClick: () => void;
  onComicModeClick: () => void;
}

export function FloatingActions({
  bookId,
  bookTitle,
  userId,
  totalChapters,
  currentChapter,
  cognitiveLevel,
  hasCodeContent,
  hasComicContent,
  isQuizUnlocked,
  quizProgress,
  onVoiceClick,
  onQuizClick,
  onQAClick,
  onPlaygroundClick,
  onComicModeClick,
}: FloatingActionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className="fixed z-[60]"
      style={{ 
        bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        right: "max(1rem, env(safe-area-inset-right))"
      }}
    >
      {/* Expanded Menu */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="absolute bottom-14 right-0 flex flex-col gap-2 bg-background/95 backdrop-blur-lg rounded-xl p-3 border border-border/50 shadow-xl min-w-[160px]"
          >
            {/* Voice AI */}
            <VoiceConversationButton 
              onClick={() => {
                onVoiceClick();
                setIsExpanded(false);
              }} 
              cognitiveLevel={cognitiveLevel}
            />

            {/* Quiz button with gating */}
            {isQuizUnlocked ? (
              <QuizModeButton onClick={() => {
                onQuizClick();
                setIsExpanded(false);
              }} />
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-2 opacity-60 justify-start"
                title={`Read ${Math.max(0, 80 - quizProgress).toFixed(0)}% more to unlock quiz`}
              >
                <GraduationCap className="h-4 w-4" />
                <span className="text-xs">🔒 Quiz {Math.round(quizProgress)}%</span>
              </Button>
            )}

            {/* Interactive Q&A */}
            <InteractiveQAButton onClick={() => {
              onQAClick();
              setIsExpanded(false);
            }} />

            {/* Playground button - only show for technical content */}
            {hasCodeContent && (
              <Button
                onClick={() => {
                  onPlaygroundClick();
                  setIsExpanded(false);
                }}
                variant="outline"
                size="sm"
                className="gap-2 justify-start"
                title="Open Code Playground"
              >
                <Code2 className="h-4 w-4" />
                <span className="text-xs">Playground</span>
              </Button>
            )}

            {/* VLD-1.0: Learning Deck Generator */}
            <LearningDeckGenerator
              bookId={bookId}
              bookTitle={bookTitle}
              userId={userId}
              totalChapters={totalChapters}
              currentChapter={currentChapter}
              variant="inline"
            />

            {/* Comic Reader button - only show for comic content */}
            {hasComicContent && (
              <Button
                onClick={() => {
                  onComicModeClick();
                  setIsExpanded(false);
                }}
                variant="outline"
                size="sm"
                className="gap-2 justify-start bg-primary/10 border-primary/30"
                title="Open Comic Reader"
              >
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-xs">Comic Mode</span>
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
          isExpanded 
            ? 'bg-destructive text-destructive-foreground' 
            : 'bg-primary text-primary-foreground'
        }`}
        whileTap={{ scale: 0.9 }}
      >
        {isExpanded ? (
          <X className="h-5 w-5" />
        ) : (
          <Presentation className="h-5 w-5" />
        )}
      </motion.button>
    </div>
  );
}