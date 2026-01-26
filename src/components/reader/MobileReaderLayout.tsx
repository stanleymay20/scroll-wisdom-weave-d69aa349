/**
 * Mobile Reader Layout Component
 * 
 * Optimized mobile reading experience with:
 * - Swipe navigation between chapters
 * - Touch-friendly controls
 * - Clean single-column design
 * - Gesture-based interactions
 */

import { useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Home,
  Settings,
  BookOpen,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileReaderLayoutProps {
  children: ReactNode;
  bookTitle: string;
  chapterTitle: string;
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onClose: () => void;
  onSettingsClick: () => void;
  readingTheme: {
    bg: string;
    text: string;
  };
}

export function MobileReaderLayout({
  children,
  bookTitle,
  chapterTitle,
  currentChapter,
  totalChapters,
  onPrevChapter,
  onNextChapter,
  onClose,
  onSettingsClick,
  readingTheme,
}: MobileReaderLayoutProps) {
  const [showControls, setShowControls] = useState(true);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout>>();
  
  // Motion values for swipe gesture
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0, 100], [0.5, 1, 0.5]);
  
  // Auto-hide controls after 3 seconds of inactivity
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    setShowControls(true);
    hideControlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Toggle controls on tap
  const handleTap = useCallback(() => {
    if (showControls) {
      setShowControls(false);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    } else {
      resetHideTimer();
    }
  }, [showControls, resetHideTimer]);

  // Handle swipe gestures for chapter navigation
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 80;
      const velocity = 500;

      if (info.offset.x > threshold || info.velocity.x > velocity) {
        // Swiped right - go to previous chapter
        if (currentChapter > 1) {
          setSwipeDirection('right');
          onPrevChapter();
        }
      } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
        // Swiped left - go to next chapter
        if (currentChapter < totalChapters) {
          setSwipeDirection('left');
          onNextChapter();
        }
      }
    },
    [currentChapter, totalChapters, onPrevChapter, onNextChapter]
  );

  // Reset swipe direction after animation
  useEffect(() => {
    if (swipeDirection) {
      const timer = setTimeout(() => setSwipeDirection(null), 300);
      return () => clearTimeout(timer);
    }
  }, [swipeDirection]);

  // Initialize hide timer
  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [resetHideTimer]);

  // Progress percentage
  const progress = ((currentChapter) / totalChapters) * 100;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 flex flex-col",
        readingTheme.bg,
        readingTheme.text
      )}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Top Header - Auto-hide */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/40 to-transparent"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 text-center px-4">
                <p className="text-white/80 text-xs truncate">{bookTitle}</p>
                <p className="text-white text-sm font-medium truncate">{chapterTitle}</p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={onSettingsClick}
                className="text-white hover:bg-white/20"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Content Area with Swipe */}
      <motion.div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        style={{ x, opacity }}
        onClick={handleTap}
      >
        <div className="px-5 py-16 min-h-full">
          {children}
        </div>
      </motion.div>

      {/* Swipe Indicators */}
      <AnimatePresence>
        {swipeDirection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 p-4 rounded-full bg-primary/20 backdrop-blur-sm",
              swipeDirection === 'left' ? "right-4" : "left-4"
            )}
          >
            {swipeDirection === 'left' ? (
              <ChevronRight className="h-8 w-8 text-primary" />
            ) : (
              <ChevronLeft className="h-8 w-8 text-primary" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation - Auto-hide */}
      <AnimatePresence>
        {showControls && (
          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/40 to-transparent"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Progress Bar */}
            <div className="px-4 py-2">
              <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
            
            {/* Navigation Controls */}
            <div className="flex items-center justify-between px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={onPrevChapter}
                disabled={currentChapter <= 1}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5 mr-1" />
                Prev
              </Button>
              
              <div className="text-center">
                <p className="text-white/80 text-xs">
                  Chapter {currentChapter} of {totalChapters}
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onNextChapter}
                disabled={currentChapter >= totalChapters}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                Next
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Tap Zones for Quick Navigation (invisible) */}
      <div 
        className="absolute left-0 top-1/4 bottom-1/4 w-12 z-10"
        onClick={(e) => {
          e.stopPropagation();
          if (currentChapter > 1) onPrevChapter();
        }}
      />
      <div 
        className="absolute right-0 top-1/4 bottom-1/4 w-12 z-10"
        onClick={(e) => {
          e.stopPropagation();
          if (currentChapter < totalChapters) onNextChapter();
        }}
      />
    </div>
  );
}

/**
 * Swipe hint overlay shown on first use
 */
export function SwipeHintOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-8"
      onClick={onDismiss}
    >
      <div className="text-center text-white space-y-4">
        <div className="flex justify-center gap-8">
          <motion.div
            animate={{ x: [-20, 0, -20] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <ChevronLeft className="h-12 w-12" />
          </motion.div>
          <BookOpen className="h-12 w-12" />
          <motion.div
            animate={{ x: [20, 0, 20] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <ChevronRight className="h-12 w-12" />
          </motion.div>
        </div>
        <p className="text-lg font-medium">Swipe to navigate chapters</p>
        <p className="text-sm text-white/70">Tap screen to show/hide controls</p>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </motion.div>
  );
}
