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
  X
} from "lucide-react";
import { LearningDeckGenerator } from "@/components/decks";

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

  // Count available actions for badge
  const actionCount = [
    true, // Voice AI always available
    isQuizUnlocked, // Quiz
    true, // Q&A always available
    hasCodeContent, // Playground
    true, // Learning Deck
    hasComicContent, // Comic mode
  ].filter(Boolean).length;

  return (
    <div 
      className="fixed z-[60]"
      style={{ 
        bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        right: "max(1rem, env(safe-area-inset-right))"
      }}
    >
      {/* Expanded Menu - Clean compact design */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10 md:hidden"
              onClick={() => setIsExpanded(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute bottom-16 right-0 bg-card backdrop-blur-xl rounded-2xl p-2 border border-border shadow-2xl"
              style={{ minWidth: '56px' }}
            >
            <div className="flex flex-col gap-1">
                {/* Voice AI */}
                <Button
                  onClick={() => {
                    onVoiceClick();
                    setIsExpanded(false);
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl hover:bg-muted"
                  title="Voice AI"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>

                {/* Quiz button with gating */}
                <Button
                  onClick={() => {
                    if (isQuizUnlocked) {
                      onQuizClick();
                      setIsExpanded(false);
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  disabled={!isQuizUnlocked}
                  className="h-10 w-10 rounded-xl hover:bg-muted disabled:opacity-50"
                  title={isQuizUnlocked ? "Quiz" : `Read ${Math.max(0, 80 - quizProgress).toFixed(0)}% more to unlock`}
                >
                  <GraduationCap className="h-5 w-5" />
                </Button>

                {/* Interactive Q&A */}
                <Button
                  onClick={() => {
                    onQAClick();
                    setIsExpanded(false);
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl hover:bg-muted"
                  title="Ask AI"
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>

                {/* Playground button - only show for technical content */}
                {hasCodeContent && (
                  <Button
                    onClick={() => {
                      onPlaygroundClick();
                      setIsExpanded(false);
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl hover:bg-muted"
                    title="Code Playground"
                  >
                    <Code2 className="h-5 w-5" />
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
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl hover:bg-primary/10"
                    title="Comic Mode"
                  >
                    <BookOpen className="h-5 w-5 text-primary" />
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toggle Button - Clean single FAB */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
          isExpanded 
            ? 'bg-destructive text-destructive-foreground rotate-45' 
            : 'bg-primary text-primary-foreground'
        }`}
        whileTap={{ scale: 0.9 }}
      >
        {isExpanded ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Presentation className="h-6 w-6" />
            {/* Badge showing number of tools */}
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-scroll-gold text-[10px] font-bold flex items-center justify-center text-background">
              {actionCount}
            </span>
          </>
        )}
      </motion.button>
    </div>
  );
}