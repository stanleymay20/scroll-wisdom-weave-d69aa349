/**
 * YouTube-quality video player controls
 * - Hover-to-reveal bottom bar
 * - Clickable/draggable seekbar with scene thumbnails
 * - Volume slider with mute toggle
 * - Time display
 * - Fullscreen toggle
 */
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, Volume1,
  Maximize, Minimize, RotateCcw,
  Download, Loader2, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CinematicScene } from "./types";

interface VideoPlayerControlsProps {
  scenes: CinematicScene[];
  currentScene: number;
  isPlaying: boolean;
  isFullscreen: boolean;
  volume: number;
  isMuted: boolean;
  sceneProgress: number;
  totalElapsed: number;
  totalDuration: number;
  isExporting: boolean;
  exportProgress: number;
  visible: boolean;
  bufferedCount?: number;
  onTogglePlay: () => void;
  onNextScene: () => void;
  onPrevScene: () => void;
  onReset: () => void;
  onSeekToScene: (index: number) => void;
  onToggleFullscreen: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onExport: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayerControls({
  scenes,
  currentScene,
  isPlaying,
  isFullscreen,
  volume,
  isMuted,
  sceneProgress,
  totalElapsed,
  totalDuration,
  isExporting,
  exportProgress,
  visible,
  bufferedCount,
  onTogglePlay,
  onNextScene,
  onPrevScene,
  onReset,
  onSeekToScene,
  onToggleFullscreen,
  onVolumeChange,
  onToggleMute,
  onExport,
}: VideoPlayerControlsProps) {
  const [showVolume, setShowVolume] = useState(false);
  const [hoveredScene, setHoveredScene] = useState<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  // Calculate overall progress across all scenes
  const overallProgress = scenes.length > 0
    ? ((currentScene + sceneProgress) / scenes.length) * 100
    : 0;

  const handleSeekBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || scenes.length === 0) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const sceneIndex = Math.floor(x * scenes.length);
    onSeekToScene(Math.max(0, Math.min(scenes.length - 1, sceneIndex)));
  }, [scenes.length, onSeekToScene]);

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-30 transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
    >
      {/* Gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

      <div className="relative px-3 pb-2 pt-8">
        {/* Seekbar */}
        <div
          ref={seekBarRef}
          className="group relative h-1 hover:h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 transition-all"
          onClick={handleSeekBarClick}
          onMouseMove={(e) => {
            if (!seekBarRef.current) return;
            const rect = seekBarRef.current.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            setHoveredScene(Math.floor(x * scenes.length));
          }}
          onMouseLeave={() => setHoveredScene(null)}
        >
          {/* Buffered indicator (light gray) */}
          {bufferedCount !== undefined && (
            <div
              className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
              style={{ width: `${(bufferedCount / Math.max(1, scenes.length)) * 100}%` }}
            />
          )}
          {/* Loaded scene indicator */}
          <div
            className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
            style={{ width: `${((currentScene + 1) / Math.max(1, scenes.length)) * 100}%` }}
          />
          {/* Progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-red-600 rounded-full transition-[width] duration-200"
            style={{ width: `${overallProgress}%` }}
          />
          {/* Seek dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            style={{ left: `${overallProgress}%`, marginLeft: "-6px" }}
          />

          {/* Scene markers */}
          {scenes.map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-white/20"
              style={{ left: `${(i / scenes.length) * 100}%` }}
            />
          ))}

          {/* Hover tooltip */}
          {hoveredScene !== null && scenes[hoveredScene] && (
            <div
              className="absolute bottom-full mb-2 -translate-x-1/2 bg-black/95 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none"
              style={{ left: `${((hoveredScene + 0.5) / scenes.length) * 100}%` }}
            >
              <span className="text-white/60">{hoveredScene + 1}.</span> {scenes[hoveredScene].title}
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-1">
          {/* Left: playback controls */}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={onPrevScene} className="text-white hover:bg-white/10 h-8 w-8">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onTogglePlay} className="text-white hover:bg-white/10 h-9 w-9">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onNextScene} className="text-white hover:bg-white/10 h-8 w-8">
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Volume */}
            <div
              className="flex items-center"
              onMouseEnter={() => setShowVolume(true)}
              onMouseLeave={() => setShowVolume(false)}
            >
              <Button variant="ghost" size="icon" onClick={onToggleMute} className="text-white hover:bg-white/10 h-8 w-8">
                <VolumeIcon className="h-4 w-4" />
              </Button>
              <div className={cn(
                "overflow-hidden transition-all duration-200",
                showVolume ? "w-20 opacity-100" : "w-0 opacity-0"
              )}>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={([v]) => onVolumeChange(v / 100)}
                  className="w-20 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:bg-white [&_.bg-primary]:bg-white"
                />
              </div>
            </div>

            {/* Time */}
            <span className="text-white/70 text-xs ml-2 font-mono tabular-nums select-none">
              {formatTime(totalElapsed)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: scene info + actions */}
          <span className="text-white/50 text-xs mr-2 select-none">
            Scene {currentScene + 1}/{scenes.length}
          </span>

          <Button
            variant="ghost" size="sm"
            onClick={onExport}
            disabled={isExporting}
            className="text-white hover:bg-white/10 h-7 gap-1 text-xs px-2"
          >
            {isExporting ? (
              <><Loader2 className="h-3 w-3 animate-spin" />{exportProgress}%</>
            ) : (
              <><Download className="h-3 w-3" />Export</>
            )}
          </Button>

          <Button variant="ghost" size="icon" onClick={onReset} className="text-white hover:bg-white/10 h-7 w-7">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="icon" onClick={onToggleFullscreen} className="text-white hover:bg-white/10 h-7 w-7">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
