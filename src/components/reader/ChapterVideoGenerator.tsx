/**
 * ChapterVideoGenerator — A+++ Tiered Video Generation
 * 
 * Free/Student: Animated text slides with transitions
 * Premium: Slides + ElevenLabs TTS narration
 * Institutional: Slides + TTS + AI-generated visuals
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Video, Play, Pause, SkipForward, SkipBack, 
  Download, X, Volume2, VolumeX, Maximize, Minimize,
  Loader2, Film, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";

interface VideoScene {
  sceneNumber: number;
  title: string;
  narration: string;
  visualType: string;
  bulletPoints?: string[];
  keyTerms?: string[];
  duration: number;
  transition: string;
  imagePrompt?: string;
}

interface VideoPlan {
  chapterTitle: string;
  bookTitle: string;
  bookType: string;
  totalDuration: number;
  scenes: VideoScene[];
  narrationAudioBase64?: string;
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

const BOOK_TYPE_THEMES: Record<string, { gradient: string; accent: string; icon: string }> = {
  standard: { gradient: "from-blue-600 to-indigo-700", accent: "bg-blue-500/20", icon: "📚" },
  professional: { gradient: "from-slate-700 to-gray-900", accent: "bg-slate-500/20", icon: "💼" },
  children: { gradient: "from-amber-400 to-pink-500", accent: "bg-amber-500/20", icon: "🌈" },
  reference: { gradient: "from-emerald-600 to-teal-700", accent: "bg-emerald-500/20", icon: "📖" },
  comic: { gradient: "from-purple-500 to-pink-600", accent: "bg-purple-500/20", icon: "💥" },
  workbook: { gradient: "from-orange-500 to-red-600", accent: "bg-orange-500/20", icon: "✏️" },
  illustrated: { gradient: "from-cyan-500 to-blue-600", accent: "bg-cyan-500/20", icon: "🎨" },
};

const transitionVariants: Record<string, object> = {
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slide_left: { initial: { x: 100, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -100, opacity: 0 } },
  slide_up: { initial: { y: 80, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -80, opacity: 0 } },
  zoom: { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
  dissolve: { initial: { opacity: 0, filter: "blur(10px)" }, animate: { opacity: 1, filter: "blur(0px)" }, exit: { opacity: 0, filter: "blur(10px)" } },
};

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

  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const playerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const hasTTS = (tier === "premium" || tier === "prophet_tier") && videoPlan?.narrationAudioBase64;
  const tierLabel = tier === "prophet_tier" ? "Institutional" : tier === "premium" ? "Premium" : tier === "student" ? "Student" : "Free";

  const generateVideo = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      setGenerationProgress(30);

      const { data, error } = await supabase.functions.invoke("generate-chapter-video", {
        body: {
          chapterContent,
          chapterTitle,
          bookTitle,
          bookType,
          tier,
          language: language || "en",
        },
      });

      setGenerationProgress(80);

      if (error) throw new Error(error.message || "Video generation failed");
      if (data?.error) throw new Error(data.error);

      setVideoPlan(data as VideoPlan);
      setGenerationProgress(100);

      // Set up audio if TTS is available
      if (data.narrationAudioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.narrationAudioBase64}`);
        audioRef.current = audio;
      }

      toast({
        title: "Video ready! 🎬",
        description: `${data.scenes?.length || 0} scenes generated (${Math.round(data.totalDuration / 60)}min)`,
      });
    } catch (err) {
      console.error("Video generation error:", err);
      toast({
        variant: "destructive",
        title: "Video generation failed",
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, toast]);

  // Auto-advance scenes
  useEffect(() => {
    if (!isPlaying || !videoPlan) return;

    const scene = videoPlan.scenes[currentScene];
    if (!scene) {
      setIsPlaying(false);
      return;
    }

    sceneTimerRef.current = setTimeout(() => {
      if (currentScene < videoPlan.scenes.length - 1) {
        setCurrentScene(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentScene(0);
      }
    }, scene.duration * 1000);

    // Progress tracking
    const elapsed = videoPlan.scenes.slice(0, currentScene).reduce((s, sc) => s + sc.duration, 0);
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = ((elapsed + (prev / 100) * scene.duration) / videoPlan.totalDuration) * 100;
        return Math.min(100, newProgress + 0.5);
      });
    }, 100);
    timerRef.current = interval;

    return () => {
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentScene, videoPlan]);

  const togglePlay = () => {
    if (!videoPlan) return;
    setIsPlaying(prev => !prev);
    if (audioRef.current) {
      isPlaying ? audioRef.current.pause() : audioRef.current.play().catch(() => {});
    }
  };

  const nextScene = () => {
    if (!videoPlan || currentScene >= videoPlan.scenes.length - 1) return;
    setCurrentScene(prev => prev + 1);
  };

  const prevScene = () => {
    if (currentScene <= 0) return;
    setCurrentScene(prev => prev - 1);
  };

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!isFullscreen) {
      playerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setIsFullscreen(prev => !prev);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    setIsMuted(prev => !prev);
  };

  const scene = videoPlan?.scenes[currentScene];
  const transition = transitionVariants[scene?.transition || "fade"] || transitionVariants.fade;

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div
        ref={playerRef}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl",
          isFullscreen && "max-w-none rounded-none"
        )}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-white" />
            <span className="text-white font-semibold text-sm truncate max-w-[200px]">
              {chapterTitle}
            </span>
            <Badge variant="outline" className="text-white border-white/30 text-xs">
              {tierLabel}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Main Canvas */}
        <div className={cn(
          "relative aspect-video bg-gradient-to-br",
          theme.gradient,
          "flex items-center justify-center"
        )}>
          {/* Generation state */}
          {isGenerating && (
            <div className="flex flex-col items-center gap-4 text-white">
              <Loader2 className="h-12 w-12 animate-spin" />
              <p className="text-lg font-medium">Generating video script...</p>
              <Progress value={generationProgress} className="w-64 h-2" />
              <p className="text-sm text-white/60">
                {generationProgress < 30 ? "Analyzing chapter content..." :
                 generationProgress < 80 ? "Creating scenes & narration..." :
                 "Finalizing video plan..."}
              </p>
            </div>
          )}

          {/* Pre-generation CTA */}
          {!isGenerating && !videoPlan && (
            <div className="flex flex-col items-center gap-6 text-white p-8 text-center">
              <div className="text-6xl">{theme.icon}</div>
              <h2 className="text-2xl font-bold">Chapter Video Generator</h2>
              <p className="text-white/70 max-w-md">
                Transform "{chapterTitle}" into an engaging animated video with
                {tier === "premium" || tier === "prophet_tier"
                  ? " professional narration and visual scenes"
                  : " animated text slides and transitions"}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge className="bg-white/20 text-white">✓ Animated Slides</Badge>
                <Badge className={cn("text-white", hasTTS ? "bg-white/20" : "bg-white/10 opacity-50")}>
                  {tier === "premium" || tier === "prophet_tier" ? "✓" : "🔒"} TTS Narration
                </Badge>
                <Badge className={cn("text-white", tier === "prophet_tier" ? "bg-white/20" : "bg-white/10 opacity-50")}>
                  {tier === "prophet_tier" ? "✓" : "🔒"} AI Visuals
                </Badge>
              </div>
              <Button
                size="lg"
                onClick={generateVideo}
                className="bg-white text-black hover:bg-white/90 font-semibold gap-2"
              >
                <Sparkles className="h-5 w-5" />
                Generate Video
              </Button>
            </div>
          )}

          {/* Scene Player */}
          {videoPlan && scene && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentScene}
                {...transition}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16"
              >
                {/* Scene type indicator */}
                <div className="absolute top-16 right-4 flex items-center gap-2">
                  <Badge className={cn("text-white/80 text-xs", theme.accent)}>
                    {scene.visualType.replace("_", " ")}
                  </Badge>
                  <span className="text-white/50 text-xs">
                    {currentScene + 1}/{videoPlan.scenes.length}
                  </span>
                </div>

                {/* Title Card */}
                {scene.visualType === "title_card" && (
                  <div className="text-center">
                    <motion.h1
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-4xl md:text-5xl font-bold text-white mb-4"
                    >
                      {scene.title}
                    </motion.h1>
                    <motion.p
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-xl text-white/80"
                    >
                      {videoPlan.bookTitle}
                    </motion.p>
                  </div>
                )}

                {/* Key Concept */}
                {scene.visualType === "key_concept" && (
                  <div className="text-center max-w-2xl">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20"
                    >
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{scene.title}</h2>
                      {scene.keyTerms && scene.keyTerms.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center mb-4">
                          {scene.keyTerms.map((term, i) => (
                            <motion.span
                              key={term}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.4 + i * 0.15 }}
                            >
                              <Badge className="bg-white/20 text-white text-sm px-3 py-1">
                                {term}
                              </Badge>
                            </motion.span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </div>
                )}

                {/* Text Slide / Summary / Diagram */}
                {(scene.visualType === "text_slide" || scene.visualType === "summary" || scene.visualType === "diagram_description") && (
                  <div className="max-w-2xl w-full">
                    <motion.h2
                      initial={{ x: -30, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-2xl md:text-3xl font-bold text-white mb-6"
                    >
                      {scene.title}
                    </motion.h2>
                    {scene.bulletPoints && scene.bulletPoints.length > 0 ? (
                      <ul className="space-y-3">
                        {scene.bulletPoints.map((point, i) => (
                          <motion.li
                            key={i}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.4 + i * 0.2 }}
                            className="flex items-start gap-3 text-white/90 text-lg"
                          >
                            <span className="mt-1 h-2 w-2 rounded-full bg-white/60 flex-shrink-0" />
                            {point}
                          </motion.li>
                        ))}
                      </ul>
                    ) : (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/80 text-lg leading-relaxed"
                      >
                        {scene.narration}
                      </motion.p>
                    )}
                  </div>
                )}

                {/* Quiz Prompt */}
                {scene.visualType === "quiz_prompt" && (
                  <div className="text-center max-w-xl">
                    <motion.div
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ delay: 0.3, type: "spring" }}
                      className="bg-white/15 backdrop-blur-sm rounded-2xl p-8 border border-white/30"
                    >
                      <span className="text-4xl mb-4 block">🤔</span>
                      <h2 className="text-xl md:text-2xl font-bold text-white mb-2">
                        {scene.title}
                      </h2>
                      <p className="text-white/80 text-lg">{scene.narration}</p>
                    </motion.div>
                  </div>
                )}

                {/* Narration subtitle */}
                {isPlaying && scene.visualType !== "quiz_prompt" && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-24 left-8 right-8"
                  >
                    <p className="text-white/70 text-sm md:text-base text-center italic bg-black/30 rounded-lg px-4 py-2 backdrop-blur-sm">
                      {scene.narration}
                    </p>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Controls */}
        {videoPlan && (
          <div className="bg-black/90 px-4 py-3">
            {/* Progress bar */}
            <div className="mb-3">
              <Progress 
                value={(currentScene / videoPlan.scenes.length) * 100} 
                className="h-1 bg-white/10" 
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={prevScene} className="text-white hover:bg-white/10 h-8 w-8">
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/10 h-10 w-10">
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={nextScene} className="text-white hover:bg-white/10 h-8 w-8">
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              <span className="text-white/60 text-xs">
                Scene {currentScene + 1} of {videoPlan.scenes.length} · ~{Math.round(videoPlan.totalDuration / 60)}min
              </span>

              <div className="flex items-center gap-1">
                {hasTTS && (
                  <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:bg-white/10 h-8 w-8">
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/10 h-8 w-8">
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
