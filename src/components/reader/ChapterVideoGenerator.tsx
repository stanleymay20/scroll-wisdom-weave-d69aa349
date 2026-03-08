/**
 * ChapterVideoGenerator — YouTube-quality cinematic video player
 * with TTS narration, Ken Burns camera effects, and MP4 export.
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

export function ChapterVideoGenerator({
  bookId, bookTitle, bookType, chapterTitle, chapterContent, chapterNumber, language, onClose,
}: ChapterVideoGeneratorProps) {
  const { tier } = useSubscription();
  const { toast } = useToast();
  const narration = useVideoNarration();

  const [scenes, setScenes] = useState<CinematicScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [phase, setPhase] = useState<VideoPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [cameraProgress, setCameraProgress] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const playerRef = useRef<HTMLDivElement>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const sceneStartRef = useRef<number>(0);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const scene = scenes[currentScene];
  const hasCinematicAccess = canUseCinematicVideo(tier);

  // Total duration calculation
  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const elapsedBefore = scenes.slice(0, currentScene).reduce((s, sc) => s + sc.duration, 0);
  const totalElapsed = elapsedBefore + (scene ? scene.duration * cameraProgress : 0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      narration.stopAllAudio();
    };
  }, []);

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

    // Play narration for this scene
    narration.playSceneAudio(scene.sceneNumber);

    sceneTimerRef.current = setTimeout(() => {
      if (currentScene < scenes.length - 1) {
        setCurrentScene(prev => prev + 1);
        setCameraProgress(0);
      } else {
        setIsPlaying(false);
        narration.stopAllAudio();
        setCurrentScene(0);
        setCameraProgress(0);
        setControlsVisible(true);
      }
    }, scene.duration * 1000);

    return () => { if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current); };
  }, [isPlaying, currentScene, scene, scenes.length]);

  // Volume sync
  useEffect(() => {
    narration.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // ── Generate video + narration ─────────────────────────────
  const generateVideo = useCallback(async () => {
    if (!hasCinematicAccess) {
      toast({ variant: "destructive", title: "Premium feature", description: "Cinematic video requires Premium or Institutional plan." });
      return;
    }
    setIsGenerating(true);
    setPhase("scripting");
    setProgress(10);
    setProgressLabel("AI is writing the cinematic script...");

    try {
      // Phase 1: Scene plan
      const { data: planData, error: planError } = await supabase.functions.invoke("generate-cinematic-video", {
        body: { chapterContent, chapterTitle, bookTitle, bookType, tier, language: language || "en", chapterNumber },
      });
      if (planError) throw new Error(planError.message);
      if (planData?.error) throw new Error(planData.error);

      let scenePlan = planData.scenes as CinematicScene[];
      setScenes(scenePlan);
      setProgress(25);
      setPhase("imaging");
      setProgressLabel(`Generating ${scenePlan.length} cinematic keyframes...`);

      // Phase 2: Generate images in batches
      const BATCH_SIZE = 2;
      const updatedScenes = [...scenePlan];
      for (let i = 0; i < scenePlan.length; i += BATCH_SIZE) {
        setProgressLabel(`Rendering scene ${i + 1}–${Math.min(i + BATCH_SIZE, scenePlan.length)} of ${scenePlan.length}...`);
        const { data: imgData, error: imgError } = await supabase.functions.invoke("generate-cinematic-video", {
          body: {
            chapterContent, chapterTitle, bookTitle, bookType, tier,
            language: language || "en", chapterNumber,
            scenePlan: { scenes: scenePlan, batchStart: i, batchSize: BATCH_SIZE },
          },
        });
        if (!imgError && imgData?.images) {
          Object.entries(imgData.images).forEach(([num, url]) => {
            const idx = updatedScenes.findIndex(s => s.sceneNumber === Number(num));
            if (idx >= 0) updatedScenes[idx] = { ...updatedScenes[idx], imageUrl: url as string };
          });
          setScenes([...updatedScenes]);
        }
        if (imgData?.rateLimited) {
          setProgressLabel("Rate limited — waiting 5s...");
          await new Promise(r => setTimeout(r, 5000));
        }
        setProgress(Math.min(70, 25 + Math.round(((i + BATCH_SIZE) / scenePlan.length) * 45)));
      }

      // Phase 3: Generate narration audio
      setPhase("narrating");
      setProgress(75);
      setProgressLabel("Generating voice narration...");
      const scenesWithAudio = await narration.generateNarration(updatedScenes);
      setScenes(scenesWithAudio);

      setProgress(100);
      setPhase("ready");
      const imgCount = scenesWithAudio.filter(s => s.imageUrl).length;
      const audioCount = scenesWithAudio.filter(s => s.audioUrl).length;
      toast({
        title: "🎬 Cinematic video ready!",
        description: `${scenesWithAudio.length} scenes · ${imgCount} AI visuals · ${audioCount} narrated`,
      });
    } catch (err) {
      console.error("Video generation error:", err);
      toast({ variant: "destructive", title: "Video generation failed", description: err instanceof Error ? err.message : "Please try again" });
      setPhase("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, toast, hasCinematicAccess, narration]);

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = () => {
    if (scenes.length === 0) return;
    if (isPlaying) {
      narration.pauseAudio();
    } else {
      if (phase !== "playing") setPhase("playing");
    }
    setIsPlaying(prev => !prev);
    setCameraProgress(0);
    resetControlsTimer();
  };

  const nextScene = () => {
    if (currentScene < scenes.length - 1) {
      narration.stopAllAudio();
      setCurrentScene(prev => prev + 1);
      setCameraProgress(0);
    }
  };

  const prevScene = () => {
    if (currentScene > 0) {
      narration.stopAllAudio();
      setCurrentScene(prev => prev - 1);
      setCameraProgress(0);
    }
  };

  const seekToScene = (index: number) => {
    narration.stopAllAudio();
    setCurrentScene(index);
    setCameraProgress(0);
    if (isPlaying) {
      // Will auto-play narration via effect
    }
  };

  const resetVideo = () => {
    narration.stopAllAudio();
    setCurrentScene(0);
    setIsPlaying(false);
    setCameraProgress(0);
    setControlsVisible(true);
  };

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!isFullscreen) playerRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFullscreen(prev => !prev);
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (v > 0 && isMuted) setIsMuted(false);
  };

  const toggleMute = () => setIsMuted(prev => !prev);

  // ── MP4 Export ─────────────────────────────────────────────
  const exportAsMP4 = useCallback(async () => {
    if (scenes.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9" : "video/webm";
      const stream = canvas.captureStream(30);

      // Add audio tracks from narration if available
      const audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();
      stream.getAudioTracks().forEach(t => stream.removeTrack(t));
      destination.stream.getAudioTracks().forEach(t => stream.addTrack(t));

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // Preload images
      const loadedImages: Record<number, HTMLImageElement> = {};
      await Promise.all(scenes.map(async (s) => {
        if (!s.imageUrl) return;
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { loadedImages[s.sceneNumber] = img; resolve(); };
          img.onerror = () => resolve();
          img.src = s.imageUrl!;
        });
      }));

      recorder.start();

      for (let si = 0; si < scenes.length; si++) {
        const s = scenes[si];
        const fps = 30;
        const totalFrames = Math.round(s.duration * fps);
        const img = loadedImages[s.sceneNumber];

        for (let f = 0; f < totalFrames; f++) {
          const p = f / totalFrames;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, 1920, 1080);

          if (img) {
            ctx.save();
            const move = s.cameraMove;
            const scale = move === "slow_zoom_in" ? 1 + p * 0.15
              : move === "slow_zoom_out" ? 1.15 - p * 0.15 : 1 + p * 0.08;
            const tx = move === "pan_left" ? -p * 96 : move === "pan_right" ? p * 96
              : move === "ken_burns_tl_to_br" ? p * 58 : move === "ken_burns_br_to_tl" ? -p * 58 : 0;
            const ty = move === "pan_up" ? -p * 54
              : move === "ken_burns_tl_to_br" ? p * 32 : move === "ken_burns_br_to_tl" ? -p * 32 : 0;

            ctx.translate(960 + tx, 540 + ty);
            ctx.scale(scale, scale);
            ctx.translate(-960, -540);

            const imgAspect = img.width / img.height;
            const canvasAspect = 1920 / 1080;
            let dw: number, dh: number, dx: number, dy: number;
            if (imgAspect > canvasAspect) {
              dh = 1080; dw = 1080 * imgAspect; dx = (1920 - dw) / 2; dy = 0;
            } else {
              dw = 1920; dh = 1920 / imgAspect; dx = 0; dy = (1080 - dh) / 2;
            }
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(0, 0, 1920, 1080);
          } else {
            const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
            grad.addColorStop(0, "#1e3a5f");
            grad.addColorStop(1, "#0d1b2a");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1920, 1080);
          }

          const textAlpha = Math.min(1, f / (fps * 0.8));
          ctx.globalAlpha = textAlpha;
          if (s.emoji) {
            ctx.font = "72px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff";
            ctx.fillText(s.emoji, 960, 380);
          }
          ctx.font = "bold 56px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 12;
          ctx.fillText(s.title, 960, 470, 1600);
          ctx.shadowBlur = 0;
          if (s.textOverlay) {
            ctx.font = "36px system-ui, sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(s.textOverlay, 960, 540, 1500);
          }
          ctx.font = "italic 28px system-ui, sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          const narrationLines = wrapText(ctx, s.narration, 1400);
          narrationLines.forEach((line, li) => { ctx.fillText(line, 960, 820 + li * 36, 1500); });
          ctx.font = "20px system-ui, sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.textAlign = "right";
          ctx.fillText(`${si + 1} / ${scenes.length}`, 1880, 1050);
          ctx.globalAlpha = 1;
          await new Promise(r => setTimeout(r, 1000 / fps));
        }
        setExportProgress(Math.round(((si + 1) / scenes.length) * 100));
      }

      recorder.stop();
      await new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      audioCtx.close();

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chapterTitle.replace(/[^a-zA-Z0-9]/g, "_")}_cinematic.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "🎬 Video exported!", description: "Cinematic WebM video saved." });
    } catch (err) {
      console.error("Export error:", err);
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setIsExporting(false);
    }
  }, [scenes, chapterTitle, toast]);

  const isReady = phase === "ready" || phase === "playing";

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
        {/* Top bar — always visible during generation, hover-visible during playback */}
        <div className={cn(
          "absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 transition-opacity duration-300",
          "bg-gradient-to-b from-black/70 to-transparent",
          isReady && !controlsVisible && "opacity-0"
        )}>
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-white/80" />
            <span className="text-white font-medium text-sm truncate max-w-[240px]">{chapterTitle}</span>
            <Badge variant="outline" className="border-white/20 text-white/70 text-[10px] h-5">{theme.label}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 h-7 w-7 p-0 rounded-full">
            ✕
          </Button>
        </div>

        {/* Main viewport */}
        <div
          className={cn("relative aspect-video bg-black flex items-center justify-center overflow-hidden cursor-pointer")}
          onClick={() => isReady && togglePlay()}
        >
          {/* Generating state */}
          {isGenerating && (
            <div className="flex flex-col items-center gap-4 text-white z-10 p-8">
              <Loader2 className="h-12 w-12 animate-spin text-white/80" />
              <p className="text-lg font-medium">
                {phase === "scripting" ? "Writing cinematic script..." :
                 phase === "imaging" ? "Generating AI keyframes..." :
                 phase === "narrating" ? "Generating voice narration..." : "Processing..."}
              </p>
              <Progress value={progress} className="w-80 h-1.5" />
              <p className="text-sm text-white/50">{progressLabel}</p>
              {phase === "narrating" && (
                <p className="text-xs text-white/40">Narration: {narration.progress}% complete</p>
              )}
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
                <Badge className="bg-white/10 text-white/80 border-white/10">AI Cinematic Keyframes</Badge>
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
          {isReady && scene && (
            <>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentScene}
                  {...(transitionVariants[scene.transition] || transitionVariants.fade)}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                  {/* AI image with camera move */}
                  {scene.imageUrl ? (
                    <div className="absolute inset-0 will-change-transform"
                      style={getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0)}>
                      <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className={cn("absolute inset-0 bg-gradient-to-br", theme.gradient)} />
                  )}

                  {/* Darken for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />

                  {/* Content overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10">
                    <Badge className="absolute top-14 right-4 bg-black/40 backdrop-blur-sm text-white/60 text-[10px] border-white/10">
                      {scene.visualType.replace(/_/g, " ")}
                    </Badge>

                    {scene.emoji && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }} className="text-5xl mb-4">
                        {scene.emoji}
                      </motion.div>
                    )}

                    <motion.h2 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-3xl md:text-5xl font-bold text-white text-center mb-4 drop-shadow-lg max-w-3xl leading-tight">
                      {scene.title}
                    </motion.h2>

                    {scene.textOverlay && scene.textOverlay !== scene.title && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-xl text-white/85 text-center mb-6 max-w-2xl drop-shadow-md">
                        {scene.textOverlay}
                      </motion.p>
                    )}

                    {/* Narration text — shown as subtitles at bottom */}
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }} className="absolute bottom-20 left-6 right-6">
                      <p className="text-white/80 text-base md:text-lg text-center bg-black/60 rounded-lg px-6 py-3 backdrop-blur-sm line-clamp-3 max-w-3xl mx-auto">
                        {scene.narration}
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Center play button when paused */}
              {!isPlaying && (
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
        {isReady && (
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
