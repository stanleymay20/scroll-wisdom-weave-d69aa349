/**
 * ChapterVideoGenerator — Thin orchestrator composing modular video hooks and components.
 * ~120 lines vs original 707.
 */

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Film } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { canUseCinematicVideo } from "@/lib/subscription";
import { cn } from "@/lib/utils";

import type { ChapterVideoGeneratorProps } from "./video/types";
import { BOOK_TYPE_THEMES } from "./video/types";
import { VideoPlayerControls } from "./video/VideoPlayerControls";
import { useVideoNarration } from "./video/useVideoNarration";
import { useVideoPlayer } from "./video/useVideoPlayer";
import { useVideoGeneration } from "./video/useVideoGeneration";
import { useVideoExport } from "./video/useVideoExport";
import { VideoIdleScreen } from "./video/VideoIdleScreen";
import { VideoSceneRenderer } from "./video/VideoSceneRenderer";
import { VideoGeneratingOverlay, VideoBufferingOverlay } from "./video/VideoGeneratingOverlay";

export function ChapterVideoGenerator({
  bookId, bookTitle, bookType, chapterTitle, chapterContent, chapterNumber, language, onClose,
}: ChapterVideoGeneratorProps) {
  const { tier } = useSubscription();
  const { toast } = useToast();
  const narration = useVideoNarration();
  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const hasCinematicAccess = canUseCinematicVideo(tier);

  const player = useVideoPlayer({ narration, onClose });

  const { generateVideo } = useVideoGeneration({
    chapterContent, chapterTitle, bookTitle, bookType, tier, language: language || "en", chapterNumber,
    narration, hasCinematicAccess,
    setScenes: player.setScenes, setReadyCount: player.setReadyCount,
    setIsGenerating: player.setIsGenerating, setPhase: player.setPhase,
    setProgress: player.setProgress, setProgressLabel: player.setProgressLabel,
    setAutoPlayTriggered: player.setAutoPlayTriggered, imageBlobUrlsRef: player.imageBlobUrlsRef,
  });

  const { isExporting, exportProgress, exportAsMP4 } = useVideoExport();

  const handleGenerate = () => generateVideo(toast);
  const handleExport = () => exportAsMP4(player.scenes, chapterTitle, toast);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        ref={player.playerRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative w-full max-w-6xl rounded-xl overflow-hidden shadow-2xl bg-black",
          player.isFullscreen && "max-w-none rounded-none h-full"
        )}
        onMouseMove={player.resetControlsTimer}
        onMouseLeave={() => player.isPlaying && !player.controlsVisible}
      >
        {/* Top bar */}
        <div className={cn(
          "absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 transition-opacity duration-300",
          "bg-gradient-to-b from-black/70 to-transparent",
          (player.isReady || player.isStreamingReady) && !player.controlsVisible && "opacity-0"
        )}>
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-white/80" />
            <span className="text-white font-medium text-sm truncate max-w-[240px]">{chapterTitle}</span>
            <Badge variant="outline" className="border-white/20 text-white/70 text-[10px] h-5">{theme.label}</Badge>
            {player.isGenerating && player.isStreamingReady && (
              <Badge className="bg-red-500/80 text-white text-[10px] h-5 animate-pulse">
                ● LIVE — {player.readyCount}/{player.scenes.length} buffered
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 h-7 w-7 p-0 rounded-full">
            ✕
          </Button>
        </div>

        {/* Main viewport */}
        <div
          className="relative aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer"
          onClick={() => (player.isReady || player.isStreamingReady) && player.togglePlay()}
        >
          {/* Generating state */}
          {player.isGenerating && !player.isStreamingReady && (
            <VideoGeneratingOverlay phase={player.phase} progress={player.progress} progressLabel={player.progressLabel} />
          )}

          {/* Buffering overlay */}
          {player.isBuffering && (
            <VideoBufferingOverlay currentScene={player.currentScene} readyCount={player.readyCount} totalScenes={player.scenes.length} />
          )}

          {/* Pre-generation CTA */}
          {player.phase === "idle" && !player.isGenerating && (
            <VideoIdleScreen chapterTitle={chapterTitle} themeIcon={theme.icon} themeLabel={theme.label} onGenerate={handleGenerate} />
          )}

          {/* Scene Player */}
          {(player.isReady || player.isStreamingReady) && player.scene && (
            <>
              <VideoSceneRenderer
                scene={player.scene}
                currentScene={player.currentScene}
                isPlaying={player.isPlaying}
                cameraProgress={player.cameraProgress}
                themeGradient={theme.gradient}
              />

              {/* Center play button when paused */}
              {!player.isPlaying && !player.isBuffering && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[20px] border-l-white border-y-[12px] border-y-transparent ml-1" />
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* YouTube-style controls */}
        {(player.isReady || player.isStreamingReady) && (
          <VideoPlayerControls
            scenes={player.scenes}
            currentScene={player.currentScene}
            isPlaying={player.isPlaying}
            isFullscreen={player.isFullscreen}
            volume={player.volume}
            isMuted={player.isMuted}
            sceneProgress={player.cameraProgress}
            totalElapsed={player.totalElapsed}
            totalDuration={player.totalDuration}
            isExporting={isExporting}
            exportProgress={exportProgress}
            visible={player.controlsVisible || !player.isPlaying}
            bufferedCount={player.readyCount}
            onTogglePlay={player.togglePlay}
            onNextScene={player.nextScene}
            onPrevScene={player.prevScene}
            onReset={player.resetVideo}
            onSeekToScene={player.seekToScene}
            onToggleFullscreen={player.toggleFullscreen}
            onVolumeChange={player.handleVolumeChange}
            onToggleMute={player.toggleMute}
            onExport={handleExport}
          />
        )}
      </motion.div>
    </div>
  );
}
