/**
 * Global Floating Audio Player
 * 
 * Renders at App level. Shows a slim bar when audio is active
 * and the user navigates away from the Reader page.
 * Allows play/pause/stop and shows current track info.
 */

import { useGlobalAudio } from "@/contexts/AudioContext";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function GlobalAudioPlayer() {
  const { state, pause, stopAndClear } = useGlobalAudio();
  const location = useLocation();
  const navigate = useNavigate();

  // Only show when there's active/paused audio AND user is NOT on the Reader page
  const isOnReader = location.pathname.startsWith("/read/");
  const hasActiveAudio = state.bookId && (state.isPlaying || state.chunkIndex > 0);
  const shouldShow = hasActiveAudio && !isOnReader;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed z-50 bottom-4 left-4 right-4 max-w-md mx-auto"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md px-4 py-3 shadow-xl">
            {/* Track info */}
            <button
              onClick={() => {
                if (state.bookId) {
                  const chapterNum = state.chapterTitle?.match(/Chapter (\d+)/)?.[1] || "1";
                  navigate(`/read/${state.bookId}/${chapterNum}`);
                }
              }}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium truncate text-foreground">
                {state.chapterTitle || "Playing audio"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {state.bookTitle || "ScrollLibrary"} 
                {state.totalChunks > 0 && ` • ${state.chunkIndex}/${state.totalChunks}`}
              </p>
            </button>

            {/* Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => {
                  if (state.bookId) {
                    const chapterNum = state.chapterTitle?.match(/Chapter (\d+)/)?.[1] || "1";
                    navigate(`/read/${state.bookId}/${chapterNum}`);
                  }
                }}
                title="Go to reader"
              >
                <BookOpen className="h-4 w-4" />
              </Button>

              {state.isPlaying ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-primary"
                  onClick={pause}
                  title="Pause"
                >
                  <Pause className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => {
                    // Navigate back to reader to resume — the reader handles playback
                    if (state.bookId) {
                      const chapterNum = state.chapterTitle?.match(/Chapter (\d+)/)?.[1] || "1";
                      navigate(`/read/${state.bookId}/${chapterNum}`);
                    }
                  }}
                  title="Resume in reader"
                >
                  <Play className="h-5 w-5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground"
                onClick={stopAndClear}
                title="Stop"
              >
                <Square className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
