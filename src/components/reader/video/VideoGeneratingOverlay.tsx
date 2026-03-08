/**
 * Loading and buffering overlays for the video player.
 */
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { VideoPhase } from "./types";

const AUTO_PLAY_THRESHOLD = 2;

interface VideoGeneratingOverlayProps {
  phase: VideoPhase;
  progress: number;
  progressLabel: string;
}

export function VideoGeneratingOverlay({ phase, progress, progressLabel }: VideoGeneratingOverlayProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-white z-10 p-8">
      <Loader2 className="h-12 w-12 animate-spin text-white/80" />
      <p className="text-lg font-medium">
        {phase === "scripting" ? "Writing cinematic script..." : "Generating first scenes..."}
      </p>
      <Progress value={progress} className="w-80 h-1.5" />
      <p className="text-sm text-white/50">{progressLabel}</p>
      <p className="text-xs text-white/30">Playback starts automatically once {AUTO_PLAY_THRESHOLD} scenes are ready</p>
    </div>
  );
}

interface VideoBufferingOverlayProps {
  currentScene: number;
  readyCount: number;
  totalScenes: number;
}

export function VideoBufferingOverlay({ currentScene, readyCount, totalScenes }: VideoBufferingOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
        <p className="text-white font-medium">Buffering scene {currentScene + 1}...</p>
        <p className="text-white/50 text-sm">{readyCount}/{totalScenes} scenes ready</p>
      </div>
    </div>
  );
}
