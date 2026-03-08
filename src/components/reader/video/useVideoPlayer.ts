/**
 * Core video player state and controls hook.
 * Manages playback, scene navigation, camera animation, and keyboard shortcuts.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import type { CinematicScene, VideoPhase } from "./types";
import type { useVideoNarration } from "./useVideoNarration";

const AUTO_PLAY_THRESHOLD = 2;

interface UseVideoPlayerOptions {
  narration: ReturnType<typeof useVideoNarration>;
  onClose: () => void;
}

export function useVideoPlayer({ narration, onClose }: UseVideoPlayerOptions) {
  const [scenes, setScenes] = useState<CinematicScene[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [phase, setPhase] = useState<VideoPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraProgress, setCameraProgress] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [autoPlayTriggered, setAutoPlayTriggered] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const sceneStartRef = useRef<number>(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageBlobUrlsRef = useRef<string[]>([]);

  const scene = scenes[currentScene];
  const isReady = phase === "ready" || phase === "playing";
  const isStreamingReady = readyCount >= AUTO_PLAY_THRESHOLD || phase === "ready" || phase === "playing";

  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const elapsedBefore = scenes.slice(0, currentScene).reduce((s, sc) => s + sc.duration, 0);
  const totalElapsed = elapsedBefore + (scene ? scene.duration * cameraProgress : 0);

  // Cleanup
  useEffect(() => {
    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      narration.stopAllAudio();
      imageBlobUrlsRef.current.forEach(url => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      imageBlobUrlsRef.current = [];
    };
  }, []);

  // Auto-play when enough scenes are buffered
  useEffect(() => {
    if (isStreamingReady && !autoPlayTriggered && scenes.length > 0 && !isPlaying) {
      setAutoPlayTriggered(true);
      setPhase("playing");
      setIsPlaying(true);
      setCurrentScene(0);
      setCameraProgress(0);
    }
  }, [isStreamingReady, autoPlayTriggered, scenes.length]);

  // Buffering detection
  useEffect(() => {
    if (isPlaying && currentScene >= readyCount && phase !== "ready") {
      setIsBuffering(true);
      setIsPlaying(false);
      narration.pauseAudio();
    } else if (isBuffering && currentScene < readyCount) {
      setIsBuffering(false);
      setIsPlaying(true);
    }
  }, [currentScene, readyCount, isPlaying, isBuffering, phase]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [isPlaying]);

  // Camera animation loop
  useEffect(() => {
    if (!isPlaying || !scene) return;
    sceneStartRef.current = performance.now();
    const animate = () => {
      const elapsed = performance.now() - sceneStartRef.current;
      const p = Math.min(1, elapsed / (scene.duration * 1000));
      setCameraProgress(p);
      if (p < 1) cameraRafRef.current = requestAnimationFrame(animate);
    };
    cameraRafRef.current = requestAnimationFrame(animate);
    return () => { if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current); };
  }, [isPlaying, currentScene, scene]);

  // Auto-advance scenes + play narration
  useEffect(() => {
    if (!isPlaying || !scene) return;
    narration.playSceneAudio(scene.sceneNumber);

    sceneTimerRef.current = setTimeout(() => {
      if (currentScene < scenes.length - 1) {
        setCurrentScene(prev => prev + 1);
        setCameraProgress(0);
      } else if (phase === "ready") {
        setIsPlaying(false);
        narration.stopAllAudio();
        setCurrentScene(0);
        setCameraProgress(0);
        setControlsVisible(true);
      } else {
        setCurrentScene(prev => prev + 1);
        setCameraProgress(0);
      }
    }, scene.duration * 1000);

    return () => { if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current); };
  }, [isPlaying, currentScene, scene, scenes.length, phase]);

  // Volume sync
  useEffect(() => { narration.setVolume(isMuted ? 0 : volume); }, [volume, isMuted]);

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (scenes.length === 0 || readyCount === 0) return;
    if (isPlaying) {
      narration.pauseAudio();
    } else {
      narration.resumeAudio();
      if (phase !== "playing" && phase !== "ready") setPhase("playing");
    }
    setIsPlaying(prev => !prev);
    resetControlsTimer();
  }, [scenes.length, readyCount, isPlaying, phase, narration, resetControlsTimer]);

  const nextScene = useCallback(() => {
    if (currentScene < Math.min(scenes.length - 1, readyCount - 1)) {
      narration.stopAllAudio();
      setCurrentScene(prev => prev + 1);
      setCameraProgress(0);
    }
  }, [currentScene, scenes.length, readyCount, narration]);

  const prevScene = useCallback(() => {
    if (currentScene > 0) {
      narration.stopAllAudio();
      setCurrentScene(prev => prev - 1);
      setCameraProgress(0);
    }
  }, [currentScene, narration]);

  const seekToScene = useCallback((index: number) => {
    if (index >= readyCount && phase !== "ready") return;
    narration.stopAllAudio();
    setCurrentScene(index);
    setCameraProgress(0);
  }, [readyCount, phase, narration]);

  const resetVideo = useCallback(() => {
    narration.stopAllAudio();
    setCurrentScene(0);
    setIsPlaying(false);
    setCameraProgress(0);
    setControlsVisible(true);
  }, [narration]);

  const toggleFullscreen = useCallback(() => {
    if (!playerRef.current) return;
    if (!isFullscreen) playerRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFullscreen(prev => !prev);
  }, [isFullscreen]);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
  }, [isMuted]);

  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (phase === "idle" && !isGenerating) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ": case "k":
          e.preventDefault();
          if (scenes.length > 0 && readyCount > 0) togglePlay();
          break;
        case "ArrowRight": e.preventDefault(); nextScene(); break;
        case "ArrowLeft": e.preventDefault(); prevScene(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "Escape":
          e.preventDefault();
          if (isFullscreen) toggleFullscreen();
          else onClose();
          break;
        case "ArrowUp": e.preventDefault(); handleVolumeChange(Math.min(1, volume + 0.1)); break;
        case "ArrowDown": e.preventDefault(); handleVolumeChange(Math.max(0, volume - 0.1)); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, isGenerating, scenes.length, readyCount, isPlaying, isFullscreen, volume]);

  return {
    // State
    scenes, setScenes, readyCount, setReadyCount,
    isGenerating, setIsGenerating, phase, setPhase,
    progress, setProgress, progressLabel, setProgressLabel,
    currentScene, isPlaying, isBuffering, isFullscreen,
    cameraProgress, volume, isMuted, controlsVisible,
    autoPlayTriggered, setAutoPlayTriggered,
    scene, isReady, isStreamingReady,
    totalDuration, totalElapsed,
    playerRef, imageBlobUrlsRef,
    // Actions
    togglePlay, nextScene, prevScene, seekToScene,
    resetVideo, toggleFullscreen, handleVolumeChange, toggleMute,
    resetControlsTimer,
  };
}
