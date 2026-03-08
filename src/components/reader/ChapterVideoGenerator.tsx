/**
 * ChapterVideoGenerator — YouTube-quality cinematic video player
 * with progressive streaming playback (plays while still generating).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Film, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { canUseCinematicVideo } from "@/lib/subscription";
import { cn } from "@/lib/utils";

import type { CinematicScene, ChapterVideoGeneratorProps, VideoPhase } from "./video/types";
import { BOOK_TYPE_THEMES } from "./video/types";
import { getCameraMoveStyle, transitionVariants, wrapText } from "./video/cameraUtils";
import { VideoPlayerControls } from "./video/VideoPlayerControls";
import { useVideoNarration } from "./video/useVideoNarration";

const AUTO_PLAY_THRESHOLD = 2;

export function ChapterVideoGenerator({
  bookId, bookTitle, bookType, chapterTitle, chapterContent, chapterNumber, language, onClose,
}: ChapterVideoGeneratorProps) {
  const { tier } = useSubscription();
  const { toast } = useToast();
  const narration = useVideoNarration();

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
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
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

  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const scene = scenes[currentScene];
  const hasCinematicAccess = canUseCinematicVideo(tier);

  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const elapsedBefore = scenes.slice(0, currentScene).reduce((s, sc) => s + sc.duration, 0);
  const totalElapsed = elapsedBefore + (scene ? scene.duration * cameraProgress : 0);

  const isReady = phase === "ready" || phase === "playing";
  const isStreamingReady = readyCount >= AUTO_PLAY_THRESHOLD || phase === "ready" || phase === "playing";

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

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when player is active (not idle)
      if (phase === "idle" && !isGenerating) return;
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          if (scenes.length > 0 && readyCount > 0) togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          nextScene();
          break;
        case "ArrowLeft":
          e.preventDefault();
          prevScene();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "Escape":
          e.preventDefault();
          if (isFullscreen) toggleFullscreen();
          else onClose();
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, isGenerating, scenes.length, readyCount, isPlaying, isFullscreen, volume]);

  // Auto-play when enough scenes are buffered
  useEffect(() => {
    if (isStreamingReady && !autoPlayTriggered && scenes.length > 0 && !isPlaying) {
      setAutoPlayTriggered(true);
      setPhase("playing");
      setIsPlaying(true);
      setCurrentScene(0);
      setCameraProgress(0);
      toast({ title: "▶️ Starting playback", description: `${readyCount} scenes buffered, rest loading in background...` });
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

  // ── Progressive generation pipeline ────────────────────────
  const generateVideo = useCallback(async () => {
    if (!hasCinematicAccess) {
      toast({ variant: "destructive", title: "Premium feature", description: "Cinematic video requires Premium or Institutional plan." });
      return;
    }
    setIsGenerating(true);
    setAutoPlayTriggered(false);
    setPhase("scripting");
    setProgress(5);
    setProgressLabel("AI writing cinematic script...");

    try {
      const { data: planData, error: planError } = await supabase.functions.invoke("generate-cinematic-video", {
        body: { chapterContent, chapterTitle, bookTitle, bookType, tier, language: language || "en", chapterNumber },
      });
      if (planError) throw new Error(planError.message);
      if (planData?.error) throw new Error(planData.error);

      const scenePlan = planData.scenes as CinematicScene[];
      setScenes(scenePlan);
      setProgress(15);
      setPhase("imaging");
      setProgressLabel(`Generating ${scenePlan.length} scenes progressively...`);

      const BATCH_SIZE = 2;
      let ready = 0;
      const updatedScenes = [...scenePlan];

      for (let i = 0; i < scenePlan.length; i += BATCH_SIZE) {
        const batchScenes = scenePlan.slice(i, i + BATCH_SIZE);
        setProgressLabel(`Scene ${i + 1}–${Math.min(i + BATCH_SIZE, scenePlan.length)} of ${scenePlan.length}...`);

        const [imgResult, ...ttsResults] = await Promise.allSettled([
          supabase.functions.invoke("generate-cinematic-video", {
            body: {
              chapterContent, chapterTitle, bookTitle, bookType, tier,
              language: language || "en", chapterNumber,
              scenePlan: { scenes: scenePlan, batchStart: i, batchSize: BATCH_SIZE },
            },
          }),
          ...batchScenes.map(s => narration.generateSingleNarration(s)),
        ]);

        // Apply image results
        if (imgResult.status === "fulfilled" && imgResult.value?.data?.images) {
          Object.entries(imgResult.value.data.images).forEach(([num, url]) => {
            const idx = updatedScenes.findIndex(s => s.sceneNumber === Number(num));
            if (idx >= 0) {
              updatedScenes[idx] = { ...updatedScenes[idx], imageUrl: url as string };
              if (typeof url === "string" && url.startsWith("blob:")) {
                imageBlobUrlsRef.current.push(url);
              }
            }
          });
          if (imgResult.value?.data?.rateLimited) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        // Apply TTS results
        ttsResults.forEach((r) => {
          if (r.status === "fulfilled" && r.value) {
            const { sceneNumber, audioUrl, audioDuration, audio } = r.value;
            const idx = updatedScenes.findIndex(s => s.sceneNumber === sceneNumber);
            if (idx >= 0 && audioUrl) {
              updatedScenes[idx] = {
                ...updatedScenes[idx],
                audioUrl,
                duration: audioDuration && audioDuration > 0
                  ? Math.max(updatedScenes[idx].duration, Math.ceil(audioDuration) + 1)
                  : updatedScenes[idx].duration,
                audioDuration,
              };
            }
            if (audio) narration.registerAudio(sceneNumber, audio);
          }
        });

        // Only count scenes as "ready" if they got at least image OR audio
        const actualReady = batchScenes.filter((_, bi) => {
          const sceneIdx = updatedScenes.findIndex(s => s.sceneNumber === batchScenes[bi].sceneNumber);
          if (sceneIdx < 0) return false;
          const sc = updatedScenes[sceneIdx];
          return !!(sc.imageUrl || sc.audioUrl);
        }).length;
        ready += actualReady || batchScenes.length;
        
        setScenes([...updatedScenes]);
        setReadyCount(ready);
        setProgress(15 + Math.round((ready / scenePlan.length) * 80));
      }

      setProgress(100);
      setPhase("ready");
      setReadyCount(updatedScenes.length);
      setIsGenerating(false);
      const imgCount = updatedScenes.filter(s => s.imageUrl).length;
      const audioCount = updatedScenes.filter(s => s.audioUrl).length;
      toast({
        title: "🎬 All scenes ready!",
        description: `${updatedScenes.length} scenes · ${imgCount} visuals · ${audioCount} narrated`,
      });
    } catch (err) {
      console.error("Video generation error:", err);
      toast({ variant: "destructive", title: "Video generation failed", description: err instanceof Error ? err.message : "Please try again" });
      setPhase("idle");
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, toast, hasCinematicAccess, narration]);

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    if (scenes.length === 0 || readyCount === 0) return;
    if (isPlaying) {
      narration.pauseAudio();
    } else {
      // Resume audio from where it left off instead of restarting
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

  // ── MP4 Export with audio ─────────────────────────────────
  const exportAsMP4 = useCallback(async () => {
    if (scenes.length === 0 || phase !== "ready") {
      toast({ title: "Wait for all scenes", description: "Export available once all scenes finish generating." });
      return;
    }
    setIsExporting(true);
    setExportProgress(0);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920; canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9" : "video/webm";
      const videoStream = canvas.captureStream(30);

      const audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();
      
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // Preload all images with CORS fallback
      const loadedImages: Record<number, HTMLImageElement> = {};
      await Promise.all(scenes.map(async (s) => {
        if (!s.imageUrl) return;
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { loadedImages[s.sceneNumber] = img; resolve(); };
          img.onerror = () => {
            // Retry without CORS for data URIs or same-origin images
            const img2 = new Image();
            img2.onload = () => { loadedImages[s.sceneNumber] = img2; resolve(); };
            img2.onerror = () => resolve(); // Skip if both fail
            img2.src = s.imageUrl!;
          };
          img.src = s.imageUrl!;
        });
      }));

      // Preload all audio as AudioBuffers
      const audioBuffers: Record<number, AudioBuffer> = {};
      await Promise.all(scenes.map(async (s) => {
        if (!s.audioUrl) return;
        try {
          const resp = await fetch(s.audioUrl);
          const arrayBuf = await resp.arrayBuffer();
          const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
          audioBuffers[s.sceneNumber] = audioBuf;
        } catch (e) {
          console.warn(`Failed to decode audio for scene ${s.sceneNumber}:`, e);
        }
      }));

      recorder.start();

      for (let si = 0; si < scenes.length; si++) {
        const s = scenes[si];
        const fps = 30;
        const totalFrames = Math.round(s.duration * fps);
        const img = loadedImages[s.sceneNumber];

        const audioBuf = audioBuffers[s.sceneNumber];
        let audioSource: AudioBufferSourceNode | null = null;
        if (audioBuf) {
          audioSource = audioCtx.createBufferSource();
          audioSource.buffer = audioBuf;
          audioSource.connect(destination);
          audioSource.start();
        }

        for (let f = 0; f < totalFrames; f++) {
          const p = f / totalFrames;
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1920, 1080);
          if (img) {
            ctx.save();
            const move = s.cameraMove;
            const scale = move === "slow_zoom_in" ? 1 + p * 0.15
              : move === "slow_zoom_out" ? 1.15 - p * 0.15 : 1 + p * 0.08;
            const tx = move === "pan_left" ? -p * 96 : move === "pan_right" ? p * 96
              : move === "ken_burns_tl_to_br" ? p * 58 : move === "ken_burns_br_to_tl" ? -p * 58 : 0;
            const ty = move === "pan_up" ? -p * 54
              : move === "ken_burns_tl_to_br" ? p * 32 : move === "ken_burns_br_to_tl" ? -p * 32 : 0;
            ctx.translate(960 + tx, 540 + ty); ctx.scale(scale, scale); ctx.translate(-960, -540);
            const imgAspect = img.width / img.height; const canvasAspect = 1920 / 1080;
            let dw: number, dh: number, dx: number, dy: number;
            if (imgAspect > canvasAspect) { dh = 1080; dw = 1080 * imgAspect; dx = (1920 - dw) / 2; dy = 0; }
            else { dw = 1920; dh = 1920 / imgAspect; dx = 0; dy = (1080 - dh) / 2; }
            ctx.drawImage(img, dx, dy, dw, dh); ctx.restore();
            ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, 1920, 1080);
          } else {
            const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
            grad.addColorStop(0, "#1e3a5f"); grad.addColorStop(1, "#0d1b2a");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, 1920, 1080);
          }
          const textAlpha = Math.min(1, f / (fps * 0.8));
          ctx.globalAlpha = textAlpha;
          if (s.emoji) { ctx.font = "72px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(s.emoji, 960, 380); }
          ctx.font = "bold 56px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 12;
          ctx.fillText(s.title, 960, 470, 1600); ctx.shadowBlur = 0;
          if (s.textOverlay) { ctx.font = "36px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillText(s.textOverlay, 960, 540, 1500); }
          ctx.font = "italic 28px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.6)";
          const narrationLines = wrapText(ctx, s.narration, 1400);
          const displayLines = narrationLines.slice(0, 4);
          displayLines.forEach((line, li) => { ctx.fillText(line, 960, 820 + li * 36, 1500); });
          ctx.font = "20px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.textAlign = "right";
          ctx.fillText(`${si + 1} / ${scenes.length}`, 1880, 1050);
          ctx.globalAlpha = 1;
          await new Promise(r => setTimeout(r, 1000 / fps));
        }

        if (audioSource) {
          try { audioSource.stop(); } catch {}
        }
        setExportProgress(Math.round(((si + 1) / scenes.length) * 100));
      }
      recorder.stop();
      await new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      await audioCtx.close();
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${chapterTitle.replace(/[^a-zA-Z0-9]/g, "_")}_cinematic.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "🎬 Video exported!", description: "Cinematic WebM video with audio saved." });
    } catch (err) {
      console.error("Export error:", err);
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setIsExporting(false);
    }
  }, [scenes, chapterTitle, toast, phase]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        ref={playerRef}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "relative w-full max-w-6xl rounded-xl overflow-hidden shadow-2xl bg-black",
          isFullscreen && "max-w-none rounded-none h-full"
        )}
        onMouseMove={resetControlsTimer}
        onMouseLeave={() => isPlaying && setControlsVisible(false)}
      >
        {/* Top bar */}
        <div className={cn(
          "absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 transition-opacity duration-300",
          "bg-gradient-to-b from-black/70 to-transparent",
          (isReady || isStreamingReady) && !controlsVisible && "opacity-0"
        )}>
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-white/80" />
            <span className="text-white font-medium text-sm truncate max-w-[240px]">{chapterTitle}</span>
            <Badge variant="outline" className="border-white/20 text-white/70 text-[10px] h-5">{theme.label}</Badge>
            {isGenerating && isStreamingReady && (
              <Badge className="bg-red-500/80 text-white text-[10px] h-5 animate-pulse">
                ● LIVE — {readyCount}/{scenes.length} buffered
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
          className={cn("relative aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer")}
          onClick={() => (isReady || isStreamingReady) && togglePlay()}
        >
          {/* Generating state */}
          {isGenerating && !isStreamingReady && (
            <div className="flex flex-col items-center gap-4 text-white z-10 p-8">
              <Loader2 className="h-12 w-12 animate-spin text-white/80" />
              <p className="text-lg font-medium">
                {phase === "scripting" ? "Writing cinematic script..." : "Generating first scenes..."}
              </p>
              <Progress value={progress} className="w-80 h-1.5" />
              <p className="text-sm text-white/50">{progressLabel}</p>
              <p className="text-xs text-white/30">Playback starts automatically once {AUTO_PLAY_THRESHOLD} scenes are ready</p>
            </div>
          )}

          {/* Buffering overlay */}
          {isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/50">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
                <p className="text-white font-medium">Buffering scene {currentScene + 1}...</p>
                <p className="text-white/50 text-sm">{readyCount}/{scenes.length} scenes ready</p>
              </div>
            </div>
          )}

          {/* Pre-generation CTA */}
          {phase === "idle" && !isGenerating && (
            <div className="flex flex-col items-center gap-6 text-white p-8 text-center z-10">
              <div className="text-7xl">{theme.icon}</div>
              <h2 className="text-3xl font-bold tracking-tight">Cinematic Video Generator</h2>
              <p className="text-white/50 max-w-lg">
                Transform "{chapterTitle}" into a cinematic {theme.label.toLowerCase()} video with
                AI visuals, Ken Burns camera effects, and voice narration
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge className="bg-white/10 text-white/80 border-white/10">⚡ Instant Playback</Badge>
                <Badge className="bg-white/10 text-white/80 border-white/10">Voice Narration</Badge>
                <Badge className="bg-white/10 text-white/80 border-white/10">Ken Burns Camera FX</Badge>
                <Badge className="bg-white/10 text-white/80 border-white/10">MP4 Export</Badge>
              </div>
              <Button size="lg" onClick={generateVideo}
                className="bg-white text-black hover:bg-white/90 font-semibold gap-2 rounded-full px-8">
                <Sparkles className="h-5 w-5" />
                Generate Cinematic Video
              </Button>
            </div>
          )}

          {/* Scene Player */}
          {(isReady || isStreamingReady) && scene && (
            <>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentScene}
                  {...(transitionVariants[scene.transition] || transitionVariants.fade)}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                  {scene.imageUrl ? (
                    <div className="absolute inset-0 will-change-transform"
                      style={getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0)}>
                      <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={cn("absolute inset-0 bg-gradient-to-br", theme.gradient)} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10">
                    <Badge className="absolute top-14 right-4 bg-black/40 backdrop-blur-sm text-white/60 text-[10px] border-white/10">
                      {scene.visualType.replace(/_/g, " ")}
                    </Badge>
                    {scene.emoji && (
                      <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="text-6xl md:text-7xl mb-6 drop-shadow-2xl">
                        {scene.emoji}
                      </motion.div>
                    )}
                    <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                      className="text-4xl md:text-6xl font-extrabold text-white text-center mb-4 max-w-4xl leading-[1.1] tracking-tight"
                      style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.4)" }}>
                      {scene.title}
                    </motion.h2>
                    {scene.textOverlay && scene.textOverlay !== scene.title && (
                      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6, duration: 0.6 }}
                        className="text-lg md:text-2xl text-white/90 text-center mb-8 max-w-2xl font-medium"
                        style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>
                        {scene.textOverlay}
                      </motion.p>
                    )}
                    {/* Subtitle bar */}
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.7, duration: 0.5 }} className="absolute bottom-24 left-4 right-4 md:left-12 md:right-12">
                      <p className="text-white text-sm md:text-lg text-center leading-relaxed px-6 py-3 rounded-md max-w-4xl mx-auto line-clamp-3 overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.75)", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                        {scene.narration}
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Center play button when paused */}
              {!isPlaying && !isBuffering && (
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
        {(isReady || isStreamingReady) && (
          <VideoPlayerControls
            scenes={scenes}
            currentScene={currentScene}
            isPlaying={isPlaying}
            isFullscreen={isFullscreen}
            volume={volume}
            isMuted={isMuted}
            sceneProgress={cameraProgress}
            totalElapsed={totalElapsed}
            totalDuration={totalDuration}
            isExporting={isExporting}
            exportProgress={exportProgress}
            visible={controlsVisible || !isPlaying}
            bufferedCount={readyCount}
            onTogglePlay={togglePlay}
            onNextScene={nextScene}
            onPrevScene={prevScene}
            onReset={resetVideo}
            onSeekToScene={seekToScene}
            onToggleFullscreen={toggleFullscreen}
            onVolumeChange={handleVolumeChange}
            onToggleMute={toggleMute}
            onExport={exportAsMP4}
          />
        )}
      </motion.div>
    </div>
  );
}
