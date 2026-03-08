/**
 * ChapterVideoGenerator — A+++ Cinematic Video Generation
 * 
 * Two-phase pipeline:
 * 1. AI generates scene plan with camera moves
 * 2. AI generates cinematic keyframe images per scene
 * 3. Canvas MediaRecorder renders real MP4 with Ken Burns effects + text overlays
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, Pause, SkipForward, SkipBack, 
  X, Volume2, VolumeX, Maximize, Minimize,
  Loader2, Film, Sparkles, RotateCcw, Download, Video
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface CinematicScene {
  sceneNumber: number;
  title: string;
  narration: string;
  visualType: string;
  imagePrompt: string;
  textOverlay: string;
  cameraMove: string;
  duration: number;
  transition: string;
  emoji: string;
  imageUrl?: string;
}

interface ChapterVideoGeneratorProps {
  bookId: string;
  bookTitle: string;
  bookType: string;
  chapterTitle: string;
  chapterContent: string;
  chapterNumber: number;
  language?: string;
  onClose: () => void;
}

// ── Theme map ────────────────────────────────────────────────

const BOOK_TYPE_THEMES: Record<string, { gradient: string; icon: string; label: string }> = {
  standard:     { gradient: "from-blue-600 to-indigo-700",    icon: "📚", label: "Academic Lecture" },
  professional: { gradient: "from-slate-800 to-zinc-900",     icon: "💼", label: "Executive Briefing" },
  children:     { gradient: "from-amber-400 via-pink-400 to-purple-400", icon: "🌈", label: "Animated Story" },
  reference:    { gradient: "from-emerald-600 to-teal-700",   icon: "📖", label: "Reference Guide" },
  comic:        { gradient: "from-purple-600 via-pink-500 to-red-500", icon: "💥", label: "Visual Narrative" },
  workbook:     { gradient: "from-orange-500 to-red-600",     icon: "✏️", label: "Tutorial" },
  illustrated:  { gradient: "from-cyan-500 to-blue-600",      icon: "🎨", label: "Illustrated Guide" },
  bestseller:   { gradient: "from-yellow-600 via-amber-600 to-orange-700", icon: "🔥", label: "TED-Talk Style" },
};

// ── Camera move CSS transforms ───────────────────────────────

function getCameraMoveStyle(move: string, progress: number): React.CSSProperties {
  const p = Math.min(1, Math.max(0, progress));
  const ease = p; // linear for smoothness

  switch (move) {
    case "slow_zoom_in":
      return { transform: `scale(${1 + ease * 0.15})`, transformOrigin: "center" };
    case "slow_zoom_out":
      return { transform: `scale(${1.15 - ease * 0.15})`, transformOrigin: "center" };
    case "pan_left":
      return { transform: `translateX(${-ease * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "pan_right":
      return { transform: `translateX(${ease * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "pan_up":
      return { transform: `translateY(${-ease * 5}%) scale(1.1)`, transformOrigin: "center" };
    case "ken_burns_tl_to_br":
      return { transform: `scale(${1 + ease * 0.12}) translate(${ease * 3}%, ${ease * 3}%)`, transformOrigin: "top left" };
    case "ken_burns_br_to_tl":
      return { transform: `scale(${1 + ease * 0.12}) translate(${-ease * 3}%, ${-ease * 3}%)`, transformOrigin: "bottom right" };
    case "static_with_pulse":
      return { transform: `scale(${1 + Math.sin(ease * Math.PI * 2) * 0.02})`, transformOrigin: "center" };
    default:
      return { transform: `scale(${1 + ease * 0.08})`, transformOrigin: "center" };
  }
}

// ── Transition variants ──────────────────────────────────────

const transitionVariants: Record<string, object> = {
  fade:       { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  crossfade:  { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  wipe_left:  { initial: { x: "100%", opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: "-100%", opacity: 0 } },
  zoom_in:    { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
};

// ── Main Component ───────────────────────────────────────────

export function ChapterVideoGenerator({
  bookId,
  bookTitle,
  bookType,
  chapterTitle,
  chapterContent,
  chapterNumber,
  language,
  onClose,
}: ChapterVideoGeneratorProps) {
  const { tier } = useSubscription();
  const { toast } = useToast();

  const [scenes, setScenes] = useState<CinematicScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scripting" | "imaging" | "ready" | "playing" | "recording">("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [cameraProgress, setCameraProgress] = useState(0);

  const playerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const sceneStartRef = useRef<number>(0);

  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const tierLabel = tier === "prophet_tier" ? "Institutional" : tier === "premium" ? "Premium" : tier === "student" ? "Student" : "Free";
  const scene = scenes[currentScene];

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    };
  }, []);

  // Camera animation loop
  useEffect(() => {
    if (!isPlaying || !scene) return;
    sceneStartRef.current = performance.now();

    const animate = () => {
      const elapsed = performance.now() - sceneStartRef.current;
      const p = Math.min(1, elapsed / (scene.duration * 1000));
      setCameraProgress(p);
      if (p < 1) {
        cameraRafRef.current = requestAnimationFrame(animate);
      }
    };
    cameraRafRef.current = requestAnimationFrame(animate);

    return () => {
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    };
  }, [isPlaying, currentScene, scene]);

  // Auto-advance scenes
  useEffect(() => {
    if (!isPlaying || !scene) return;

    sceneTimerRef.current = setTimeout(() => {
      if (currentScene < scenes.length - 1) {
        setCurrentScene(prev => prev + 1);
        setCameraProgress(0);
      } else {
        setIsPlaying(false);
        setCurrentScene(0);
        setCameraProgress(0);
      }
    }, scene.duration * 1000);

    return () => { if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current); };
  }, [isPlaying, currentScene, scene, scenes.length]);

  // ── Phase 1: Generate scene plan ───────────────────────────

  const generateVideo = useCallback(async () => {
    setIsGenerating(true);
    setPhase("scripting");
    setProgress(10);
    setProgressLabel("AI is writing the cinematic script...");

    try {
      // Phase 1: Get scene plan
      const { data: planData, error: planError } = await supabase.functions.invoke("generate-cinematic-video", {
        body: { chapterContent, chapterTitle, bookTitle, bookType, tier, language: language || "en", chapterNumber },
      });

      if (planError) throw new Error(planError.message);
      if (planData?.error) throw new Error(planData.error);

      const scenePlan = planData.scenes as CinematicScene[];
      setScenes(scenePlan);
      setProgress(30);
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

        if (imgError) {
          console.warn("Image batch error:", imgError);
        } else if (imgData?.images) {
          Object.entries(imgData.images).forEach(([num, url]) => {
            const idx = updatedScenes.findIndex(s => s.sceneNumber === Number(num));
            if (idx >= 0) updatedScenes[idx] = { ...updatedScenes[idx], imageUrl: url as string };
          });
          setScenes([...updatedScenes]);
        }

        // Rate limit cooldown
        if (imgData?.rateLimited) {
          setProgressLabel("Rate limited — waiting 5s...");
          await new Promise(r => setTimeout(r, 5000));
        }

        const pct = 30 + Math.round(((i + BATCH_SIZE) / scenePlan.length) * 65);
        setProgress(Math.min(95, pct));
      }

      setProgress(100);
      setPhase("ready");
      const imgCount = updatedScenes.filter(s => s.imageUrl).length;
      toast({
        title: "🎬 Cinematic video ready!",
        description: `${updatedScenes.length} scenes · ${imgCount} AI keyframes generated`,
      });

    } catch (err) {
      console.error("Video generation error:", err);
      toast({ variant: "destructive", title: "Video generation failed", description: err instanceof Error ? err.message : "Please try again" });
      setPhase("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, toast]);

  // ── Controls ───────────────────────────────────────────────

  const togglePlay = () => {
    if (scenes.length === 0) return;
    setIsPlaying(prev => !prev);
    if (phase !== "playing") setPhase("playing");
    setCameraProgress(0);
  };

  const nextScene = () => {
    if (currentScene < scenes.length - 1) {
      setCurrentScene(prev => prev + 1);
      setCameraProgress(0);
    }
  };

  const prevScene = () => {
    if (currentScene > 0) {
      setCurrentScene(prev => prev - 1);
      setCameraProgress(0);
    }
  };

  const resetVideo = () => {
    setCurrentScene(0);
    setIsPlaying(false);
    setCameraProgress(0);
  };

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!isFullscreen) playerRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFullscreen(prev => !prev);
  };

  // ── MP4 Export via Canvas MediaRecorder ─────────────────────

  const exportAsMP4 = useCallback(async () => {
    if (scenes.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;

      // Check if MediaRecorder supports webm
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/webm";

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // Preload all scene images
      const loadedImages: Record<number, HTMLImageElement> = {};
      await Promise.all(
        scenes.map(async (s) => {
          if (!s.imageUrl) return;
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => { loadedImages[s.sceneNumber] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = s.imageUrl!;
          });
        })
      );

      recorder.start();

      // Render each scene frame-by-frame
      for (let si = 0; si < scenes.length; si++) {
        const s = scenes[si];
        const fps = 30;
        const totalFrames = Math.round(s.duration * fps);
        const img = loadedImages[s.sceneNumber];

        for (let f = 0; f < totalFrames; f++) {
          const p = f / totalFrames; // 0..1 progress

          // Clear
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, 1920, 1080);

          // Draw background image with camera move
          if (img) {
            ctx.save();
            const move = s.cameraMove;
            const scale = move === "slow_zoom_in" ? 1 + p * 0.15
              : move === "slow_zoom_out" ? 1.15 - p * 0.15
              : 1 + p * 0.08;
            const tx = move === "pan_left" ? -p * 96 : move === "pan_right" ? p * 96
              : move === "ken_burns_tl_to_br" ? p * 58 : move === "ken_burns_br_to_tl" ? -p * 58 : 0;
            const ty = move === "pan_up" ? -p * 54
              : move === "ken_burns_tl_to_br" ? p * 32 : move === "ken_burns_br_to_tl" ? -p * 32 : 0;

            ctx.translate(960 + tx, 540 + ty);
            ctx.scale(scale, scale);
            ctx.translate(-960, -540);

            // Draw image covering canvas
            const imgAspect = img.width / img.height;
            const canvasAspect = 1920 / 1080;
            let dw: number, dh: number, dx: number, dy: number;
            if (imgAspect > canvasAspect) {
              dh = 1080; dw = 1080 * imgAspect;
              dx = (1920 - dw) / 2; dy = 0;
            } else {
              dw = 1920; dh = 1920 / imgAspect;
              dx = 0; dy = (1080 - dh) / 2;
            }
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();

            // Darken overlay for text readability
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(0, 0, 1920, 1080);
          } else {
            // Gradient fallback
            const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
            grad.addColorStop(0, "#1e3a5f");
            grad.addColorStop(1, "#0d1b2a");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1920, 1080);
          }

          // Text overlay with fade-in
          const textAlpha = Math.min(1, f / (fps * 0.8)); // fade in over 0.8s
          ctx.globalAlpha = textAlpha;

          // Emoji
          if (s.emoji) {
            ctx.font = "72px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#fff";
            ctx.fillText(s.emoji, 960, 380);
          }

          // Title
          ctx.font = "bold 56px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 12;
          ctx.fillText(s.title, 960, 470, 1600);
          ctx.shadowBlur = 0;

          // Text overlay line
          if (s.textOverlay) {
            ctx.font = "36px system-ui, sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fillText(s.textOverlay, 960, 540, 1500);
          }

          // Narration text (bottom)
          ctx.font = "italic 28px system-ui, sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          const narrationLines = wrapText(ctx, s.narration, 1400);
          narrationLines.forEach((line, li) => {
            ctx.fillText(line, 960, 820 + li * 36, 1500);
          });

          // Scene counter
          ctx.font = "20px system-ui, sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.textAlign = "right";
          ctx.fillText(`${si + 1} / ${scenes.length}`, 1880, 1050);

          ctx.globalAlpha = 1;

          // Wait for next frame
          await new Promise(r => setTimeout(r, 1000 / fps));
        }

        setExportProgress(Math.round(((si + 1) / scenes.length) * 100));
      }

      recorder.stop();
      await new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${chapterTitle.replace(/[^a-zA-Z0-9]/g, "_")}_cinematic.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "🎬 Video exported!", description: "Cinematic WebM video saved with AI-generated visuals and camera effects." });
    } catch (err) {
      console.error("Export error:", err);
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setIsExporting(false);
    }
  }, [scenes, chapterTitle, toast]);

  const sceneProgress = scenes.length ? ((currentScene + 1) / scenes.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div ref={playerRef} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={cn("relative w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl", isFullscreen && "max-w-none rounded-none")}>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-white" />
            <span className="text-white font-semibold text-sm truncate max-w-[200px]">{chapterTitle}</span>
            <Badge variant="outline" className="text-white border-white/30 text-xs">{tierLabel}</Badge>
            <Badge variant="outline" className="text-white border-white/30 text-xs">{theme.label}</Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Main Canvas */}
        <div className={cn("relative aspect-video bg-gradient-to-br", theme.gradient, "flex items-center justify-center overflow-hidden")}>

          {/* ── Generating state ── */}
          {isGenerating && (
            <div className="flex flex-col items-center gap-4 text-white z-10">
              <Loader2 className="h-12 w-12 animate-spin" />
              <p className="text-lg font-medium">
                {phase === "scripting" ? "Writing cinematic script..." : "Generating AI keyframes..."}
              </p>
              <Progress value={progress} className="w-72 h-2" />
              <p className="text-sm text-white/60">{progressLabel}</p>
            </div>
          )}

          {/* ── Pre-generation CTA ── */}
          {phase === "idle" && !isGenerating && (
            <div className="flex flex-col items-center gap-6 text-white p-8 text-center z-10">
              <div className="text-6xl">{theme.icon}</div>
              <h2 className="text-2xl font-bold">Cinematic Video Generator</h2>
              <p className="text-white/70 max-w-md">
                Transform "{chapterTitle}" into a cinematic {theme.label.toLowerCase()} video with
                AI-generated keyframes, Ken Burns camera effects, and real MP4 export
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge className="bg-white/20 text-white">✓ AI Cinematic Keyframes</Badge>
                <Badge className="bg-white/20 text-white">✓ Ken Burns Camera FX</Badge>
                <Badge className="bg-white/20 text-white">✓ Real MP4/WebM Export</Badge>
                <Badge className="bg-white/20 text-white">✓ {scenes.length || "6-10"} Scenes</Badge>
              </div>
              <Button size="lg" onClick={generateVideo} className="bg-white text-black hover:bg-white/90 font-semibold gap-2">
                <Sparkles className="h-5 w-5" />
                Generate Cinematic Video
              </Button>
            </div>
          )}

          {/* ── Scene Player ── */}
          {(phase === "ready" || phase === "playing") && scene && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentScene}
                {...(transitionVariants[scene.transition] || transitionVariants.fade)}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                {/* AI-generated scene image with camera move */}
                {scene.imageUrl ? (
                  <div
                    className="absolute inset-0 will-change-transform"
                    style={getCameraMoveStyle(scene.cameraMove, isPlaying ? cameraProgress : 0)}
                  >
                    <img
                      src={scene.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className={cn("absolute inset-0 bg-gradient-to-br", theme.gradient)} />
                )}

                {/* Dark overlay for readability */}
                <div className="absolute inset-0 bg-black/35" />

                {/* Content overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16 z-10">
                  {/* Scene type badge */}
                  <div className="absolute top-16 right-4 flex items-center gap-2">
                    <Badge className="bg-black/40 backdrop-blur-sm text-white/80 text-xs border-white/20">
                      {scene.visualType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-white/50 text-xs">{currentScene + 1}/{scenes.length}</span>
                  </div>

                  {/* Emoji */}
                  {scene.emoji && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring" }}
                      className="text-5xl mb-4"
                    >
                      {scene.emoji}
                    </motion.div>
                  )}

                  {/* Title */}
                  <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl md:text-5xl font-bold text-white text-center mb-4 drop-shadow-lg max-w-3xl"
                  >
                    {scene.title}
                  </motion.h2>

                  {/* Text overlay */}
                  {scene.textOverlay && scene.textOverlay !== scene.title && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="text-xl text-white/90 text-center mb-6 max-w-2xl drop-shadow-md"
                    >
                      {scene.textOverlay}
                    </motion.p>
                  )}

                  {/* Narration */}
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="absolute bottom-24 left-8 right-8"
                  >
                    <p className="text-white/60 text-sm text-center italic bg-black/40 rounded-lg px-4 py-2 backdrop-blur-sm line-clamp-3">
                      {scene.narration}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Controls */}
        {(phase === "ready" || phase === "playing") && (
          <div className="bg-black/90 px-4 py-3">
            <Progress value={sceneProgress} className="h-1 bg-white/10 mb-3" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={prevScene} className="text-white hover:bg-white/10 h-8 w-8">
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/10 h-10 w-10">
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={nextScene} className="text-white hover:bg-white/10 h-8 w-8">
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={resetVideo} className="text-white hover:bg-white/10 h-8 w-8">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>

              <span className="text-white/60 text-xs">
                {currentScene + 1}/{scenes.length} · ~{Math.round(scenes.reduce((s, sc) => s + sc.duration, 0) / 60)}min
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="sm"
                  onClick={exportAsMP4}
                  disabled={isExporting}
                  className="text-white hover:bg-white/10 h-8 gap-1.5 text-xs"
                  title="Export as WebM video"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {exportProgress}%
                    </>
                  ) : (
                    <>
                      <Video className="h-3.5 w-3.5" />
                      Export MP4
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/10 h-8 w-8">
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Hidden canvas for MP4 recording */}
      <canvas ref={canvasRef} className="hidden" width={1920} height={1080} />
    </div>
  );
}

// ── Helper: wrap text for canvas ─────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3); // max 3 lines
}
