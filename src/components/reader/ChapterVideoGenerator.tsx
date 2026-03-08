/**
 * ChapterVideoGenerator — A+++ Tiered Video Generation
 * 
 * Book-type-specific scene renderers with AI-generated graphics.
 * Includes MP4 download via Canvas + MediaRecorder.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, Pause, SkipForward, SkipBack, 
  X, Volume2, VolumeX, Maximize, Minimize,
  Loader2, Film, Sparkles, RotateCcw, Download, Image as ImageIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";

interface DialogueLine {
  character: string;
  line: string;
}

interface VideoScene {
  sceneNumber: number;
  title: string;
  narration: string;
  visualType: string;
  bulletPoints?: string[];
  keyTerms?: string[];
  dialogueLines?: DialogueLine[];
  duration: number;
  transition: string;
  imagePrompt?: string;
  emoji?: string;
  generatedImageUrl?: string;
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

// ── Book-type visual themes ──────────────────────────────────

const BOOK_TYPE_THEMES: Record<string, { gradient: string; accent: string; icon: string; textClass: string }> = {
  standard:     { gradient: "from-blue-600 to-indigo-700",    accent: "bg-blue-500/20",    icon: "📚", textClass: "font-serif" },
  professional: { gradient: "from-slate-800 to-zinc-900",     accent: "bg-slate-500/20",   icon: "💼", textClass: "font-sans tracking-tight" },
  children:     { gradient: "from-amber-400 via-pink-400 to-purple-400", accent: "bg-amber-500/20", icon: "🌈", textClass: "font-bold" },
  reference:    { gradient: "from-emerald-600 to-teal-700",   accent: "bg-emerald-500/20", icon: "📖", textClass: "font-mono" },
  comic:        { gradient: "from-purple-600 via-pink-500 to-red-500", accent: "bg-purple-500/20", icon: "💥", textClass: "font-bold italic" },
  workbook:     { gradient: "from-orange-500 to-red-600",     accent: "bg-orange-500/20",  icon: "✏️", textClass: "font-sans" },
  illustrated:  { gradient: "from-cyan-500 to-blue-600",      accent: "bg-cyan-500/20",    icon: "🎨", textClass: "font-sans" },
  bestseller:   { gradient: "from-yellow-600 via-amber-600 to-orange-700", accent: "bg-yellow-500/20", icon: "🔥", textClass: "font-serif italic" },
};

const transitionVariants: Record<string, object> = {
  fade:       { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slide_left: { initial: { x: 100, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -100, opacity: 0 } },
  slide_up:   { initial: { y: 80, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -80, opacity: 0 } },
  zoom:       { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
  dissolve:   { initial: { opacity: 0, filter: "blur(10px)" }, animate: { opacity: 1, filter: "blur(0px)" }, exit: { opacity: 0, filter: "blur(10px)" } },
};

// ── Scene Renderers ──────────────────────────────────────────

function TitleCardScene({ scene, bookTitle }: { scene: VideoScene; bookTitle: string }) {
  return (
    <div className="text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }} className="text-5xl mb-4">
        {scene.emoji || "🎬"}
      </motion.div>
      <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
        className="text-3xl md:text-5xl font-bold text-white mb-3 drop-shadow-lg">
        {scene.title}
      </motion.h1>
      <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
        className="text-lg text-white/70 drop-shadow">
        {bookTitle}
      </motion.p>
    </div>
  );
}

function KeyConceptScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-2xl">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
        className="bg-black/40 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
        {scene.emoji && <span className="text-3xl mb-3 block">{scene.emoji}</span>}
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">{scene.title}</h2>
        {scene.keyTerms && scene.keyTerms.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {scene.keyTerms.map((term, i) => (
              <motion.span key={term} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.12 }}>
                <Badge className="bg-white/20 text-white text-sm px-3 py-1">{term}</Badge>
              </motion.span>
            ))}
          </div>
        )}
        <p className="text-white/70 text-base">{scene.narration}</p>
      </motion.div>
    </div>
  );
}

function BulletSlideScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full">
      <motion.h2 initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
        className="text-2xl md:text-3xl font-bold text-white mb-6 drop-shadow-lg">
        {scene.emoji && <span className="mr-2">{scene.emoji}</span>}
        {scene.title}
      </motion.h2>
      {scene.bulletPoints && scene.bulletPoints.length > 0 ? (
        <ul className="space-y-3">
          {scene.bulletPoints.map((point, i) => (
            <motion.li key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.18 }}
              className="flex items-start gap-3 text-white/90 text-lg bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-white/60 flex-shrink-0" />
              {point}
            </motion.li>
          ))}
        </ul>
      ) : (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="text-white/80 text-lg leading-relaxed bg-black/30 backdrop-blur-sm rounded-lg p-4">
          {scene.narration}
        </motion.p>
      )}
    </div>
  );
}

function QuizPromptScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring" }}
        className="bg-black/40 backdrop-blur-sm rounded-2xl p-8 border border-white/30">
        <span className="text-4xl mb-4 block">{scene.emoji || "🤔"}</span>
        <h2 className="text-xl md:text-2xl font-bold text-white mb-3">{scene.title}</h2>
        <p className="text-white/80 text-lg">{scene.narration}</p>
      </motion.div>
    </div>
  );
}

function FrameworkScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
        className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{scene.emoji || "📊"}</span>
          <h2 className="text-xl md:text-2xl font-bold text-white">{scene.title}</h2>
        </div>
        {scene.bulletPoints && scene.bulletPoints.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {scene.bulletPoints.map((point, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.15 }}
                className="bg-white/10 rounded-lg p-3 text-white/90 text-sm border border-white/10">
                {point}
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-white/70">{scene.narration}</p>
        )}
      </motion.div>
    </div>
  );
}

function ActionItemsScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full">
      <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="text-2xl font-bold text-white mb-4 flex items-center gap-2 drop-shadow-lg">
        <span>🎯</span> {scene.title}
      </motion.h2>
      <div className="space-y-3">
        {(scene.bulletPoints || []).map((item, i) => (
          <motion.div key={i} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.2 }}
            className="flex items-center gap-3 bg-black/40 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/15">
            <span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {i + 1}
            </span>
            <span className="text-white/90">{item}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ChildrenStoryScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
        className="text-6xl mb-4">
        {scene.emoji || "✨"}
      </motion.div>
      <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
        className="text-3xl md:text-4xl font-bold text-white mb-4"
        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
        {scene.title}
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="text-xl text-white/90 leading-relaxed font-medium drop-shadow-lg">
        {scene.narration}
      </motion.p>
    </div>
  );
}

function SensoryScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", bounce: 0.6 }}
        className="bg-black/30 backdrop-blur-sm rounded-3xl p-8 border-2 border-white/30">
        <span className="text-5xl block mb-3">{scene.emoji || "🌟"}</span>
        <h2 className="text-2xl font-bold text-white mb-3">{scene.title}</h2>
        {scene.bulletPoints?.map((point, i) => (
          <motion.p key={i} initial={{ x: i % 2 === 0 ? -30 : 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 + i * 0.2 }}
            className="text-lg text-white/90 mb-1">
            {point}
          </motion.p>
        ))}
        {!scene.bulletPoints?.length && (
          <p className="text-lg text-white/80">{scene.narration}</p>
        )}
      </motion.div>
    </div>
  );
}

function DialogueScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full space-y-4">
      <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="text-xl font-bold text-white mb-2 italic drop-shadow-lg">
        {scene.emoji || "💬"} {scene.title}
      </motion.h2>
      {scene.dialogueLines && scene.dialogueLines.length > 0 ? (
        scene.dialogueLines.map((dl, i) => (
          <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.25 }}
            className={cn(
              "relative rounded-2xl p-4 max-w-[80%]",
              i % 2 === 0
                ? "bg-black/40 border border-white/30 ml-0"
                : "bg-black/30 border border-white/20 ml-auto"
            )}>
            <span className="text-xs font-bold text-white/60 uppercase tracking-wide">{dl.character}</span>
            <p className="text-white text-lg mt-1">"{dl.line}"</p>
          </motion.div>
        ))
      ) : (
        <p className="text-white/80 text-lg italic">{scene.narration}</p>
      )}
    </div>
  );
}

function ActionSequenceScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ x: -200, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 12 }}
        className="bg-gradient-to-r from-red-500/30 to-orange-500/30 backdrop-blur-sm rounded-2xl p-8 border-2 border-yellow-400/40">
        <span className="text-5xl block mb-3">{scene.emoji || "💥"}</span>
        <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider mb-3"
          style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
          {scene.title}
        </h2>
        <p className="text-white/90 text-lg font-medium">{scene.narration}</p>
      </motion.div>
    </div>
  );
}

function WorkedExampleScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{scene.emoji || "📝"}</span>
          <h2 className="text-xl font-bold text-white">{scene.title}</h2>
        </div>
        <div className="space-y-2">
          {(scene.bulletPoints || []).map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.2 }}
              className="flex items-start gap-3">
              <span className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-white/90">{step}</span>
            </motion.div>
          ))}
        </div>
        {!scene.bulletPoints?.length && (
          <p className="text-white/80">{scene.narration}</p>
        )}
      </motion.div>
    </div>
  );
}

function ChallengeScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring" }}
        className="bg-gradient-to-br from-orange-500/20 to-red-500/20 backdrop-blur-sm rounded-2xl p-8 border-2 border-orange-400/30">
        <span className="text-4xl block mb-3">{scene.emoji || "🏆"}</span>
        <h2 className="text-2xl font-bold text-white mb-2">{scene.title}</h2>
        <p className="text-white/80 text-lg">{scene.narration}</p>
        <div className="mt-4 text-sm text-white/50 italic">⏸ Pause and try this yourself!</div>
      </motion.div>
    </div>
  );
}

function HookScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8 }}>
        <span className="text-5xl block mb-4">{scene.emoji || "🔥"}</span>
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 italic"
          style={{ textShadow: "0 2px 15px rgba(0,0,0,0.4)" }}>
          {scene.title}
        </h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="text-xl text-white/85 leading-relaxed">
          {scene.narration}
        </motion.p>
      </motion.div>
    </div>
  );
}

function AhaMomentScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="bg-gradient-to-br from-yellow-500/30 to-amber-500/30 backdrop-blur-sm rounded-full w-48 h-48 mx-auto flex items-center justify-center border-2 border-yellow-400/40 mb-6">
        <span className="text-6xl">💡</span>
      </motion.div>
      <motion.h2 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
        className="text-2xl md:text-3xl font-bold text-white mb-3">
        {scene.title}
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="text-white/80 text-lg">
        {scene.narration}
      </motion.p>
    </div>
  );
}

function CallToActionScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="text-center max-w-xl">
      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" }}
        className="bg-black/40 backdrop-blur-sm rounded-2xl p-8 border border-white/30">
        <span className="text-4xl block mb-3">{scene.emoji || "🚀"}</span>
        <h2 className="text-2xl font-bold text-white mb-3">{scene.title}</h2>
        <p className="text-white/80 text-lg mb-4">{scene.narration}</p>
        {scene.bulletPoints?.map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.2 }}
            className="bg-white/10 rounded-lg px-4 py-2 mb-2 text-white/90">
            → {item}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function DefinitionCardScene({ scene }: { scene: VideoScene }) {
  return (
    <div className="max-w-2xl w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-black/40 backdrop-blur-sm rounded-xl border-l-4 border-emerald-400 p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{scene.emoji || "📖"}</span>
          <h2 className="text-2xl font-bold text-white font-mono">{scene.title}</h2>
        </div>
        <div className="border-t border-white/20 pt-3 mt-2">
          <p className="text-white/90 text-lg">{scene.narration}</p>
        </div>
        {scene.keyTerms && scene.keyTerms.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-white/50 text-xs uppercase tracking-wide">Related:</span>
            {scene.keyTerms.map(term => (
              <Badge key={term} className="bg-emerald-500/20 text-emerald-200 text-xs">{term}</Badge>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Scene Router ─────────────────────────────────────────────

function SceneRenderer({ scene, bookType, bookTitle }: { scene: VideoScene; bookType: string; bookTitle: string }) {
  const vt = scene.visualType;
  if (vt === "title_card" || vt === "story_opening") return <TitleCardScene scene={scene} bookTitle={bookTitle} />;
  if (["quiz_prompt", "strategic_question", "reflection_question", "quick_quiz"].includes(vt)) return <QuizPromptScene scene={scene} />;
  if (["framework", "executive_summary", "data_insight", "case_study"].includes(vt)) return <FrameworkScene scene={scene} />;
  if (vt === "action_items") return <ActionItemsScene scene={scene} />;
  if (["adventure_scene", "character_moment", "discovery", "fun_fact"].includes(vt)) return <ChildrenStoryScene scene={scene} />;
  if (vt === "sensory_experience") return <SensoryScene scene={scene} />;
  if (["dialogue_scene", "panel_establishing"].includes(vt)) return <DialogueScene scene={scene} />;
  if (["action_sequence", "reaction_shot", "cliffhanger"].includes(vt)) return <ActionSequenceScene scene={scene} />;
  if (vt === "learning_highlight" || vt === "takeaway") return <KeyConceptScene scene={scene} />;
  if (["worked_example", "step_by_step", "concept_review", "solution_reveal"].includes(vt)) return <WorkedExampleScene scene={scene} />;
  if (["practice_problem", "self_check", "challenge"].includes(vt)) return <ChallengeScene scene={scene} />;
  if (["hook", "story_beat", "key_insight"].includes(vt)) return <HookScene scene={scene} />;
  if (vt === "aha_moment" || vt === "framework_reveal") return <AhaMomentScene scene={scene} />;
  if (["call_to_action", "case_narrative"].includes(vt)) return <CallToActionScene scene={scene} />;
  if (["definition_card", "taxonomy", "cross_reference", "example_usage", "comparison_table"].includes(vt)) return <DefinitionCardScene scene={scene} />;
  if (["visual_overview", "annotated_diagram", "process_flow", "detail_zoom", "comparison_visual", "infographic", "visual_summary"].includes(vt)) return <FrameworkScene scene={scene} />;
  if (["key_concept", "learning_objectives"].includes(vt)) return <KeyConceptScene scene={scene} />;
  return <BulletSlideScene scene={scene} />;
}

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

  const [videoPlan, setVideoPlan] = useState<VideoPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [sceneImages, setSceneImages] = useState<Record<number, string>>({});
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sceneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = BOOK_TYPE_THEMES[bookType] || BOOK_TYPE_THEMES.standard;
  const hasTTS = (tier === "premium" || tier === "prophet_tier") && videoPlan?.narrationAudioBase64;
  const tierLabel = tier === "prophet_tier" ? "Institutional" : tier === "premium" ? "Premium" : tier === "student" ? "Student" : "Free";

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current);
    };
  }, []);

  // ── Generate AI images for all scenes ──────────────────────

  const generateSceneImages = useCallback(async (scenes: VideoScene[]) => {
    setIsGeneratingImages(true);
    setImageGenProgress(0);
    const images: Record<number, string> = {};

    // Generate images in batches of 2 to avoid rate limits
    const BATCH_SIZE = 2;
    for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
      const batch = scenes.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (scene) => {
          if (!scene.imagePrompt) return null;
          try {
            const { data, error } = await supabase.functions.invoke("generate-image", {
              body: {
                prompt: scene.imagePrompt,
                style: bookType === "children" ? "children"
                  : bookType === "comic" ? "comic"
                  : bookType === "professional" ? "professional"
                  : bookType === "reference" ? "reference"
                  : bookType === "bestseller" ? "bestseller"
                  : bookType === "workbook" ? "workbook"
                  : "illustration",
                isPremium: tier === "premium" || tier === "prophet_tier",
              },
            });
            if (error || !data?.imageUrl) return null;
            return { sceneNumber: scene.sceneNumber, url: data.imageUrl };
          } catch {
            return null;
          }
        })
      );

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          images[result.value.sceneNumber] = result.value.url;
        }
      });

      setImageGenProgress(Math.round(((i + batch.length) / scenes.length) * 100));
      setSceneImages({ ...images });
    }

    setSceneImages(images);
    setIsGeneratingImages(false);
    const count = Object.keys(images).length;
    if (count > 0) {
      toast({ title: `🎨 ${count} scene graphics generated`, description: "AI visuals are now displayed as scene backgrounds." });
    }
  }, [bookType, tier, toast]);

  const generateVideo = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress(10);

    try {
      setGenerationProgress(30);
      const { data, error } = await supabase.functions.invoke("generate-chapter-video", {
        body: { chapterContent, chapterTitle, bookTitle, bookType, tier, language: language || "en", chapterNumber },
      });

      setGenerationProgress(80);
      if (error) throw new Error(error.message || "Video generation failed");
      if (data?.error) throw new Error(data.error);

      setVideoPlan(data as VideoPlan);
      setGenerationProgress(100);

      if (data.narrationAudioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.narrationAudioBase64}`);
        audioRef.current = audio;
      }

      toast({ title: "Video ready! 🎬", description: `${data.scenes?.length || 0} scenes · ~${Math.round(data.totalDuration / 60)}min` });

      // Auto-generate scene images
      if (data.scenes?.length) {
        generateSceneImages(data.scenes);
      }
    } catch (err) {
      console.error("Video generation error:", err);
      toast({ variant: "destructive", title: "Video generation failed", description: err instanceof Error ? err.message : "Please try again" });
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, toast, generateSceneImages]);

  // Auto-advance scenes
  useEffect(() => {
    if (!isPlaying || !videoPlan) return;
    const scene = videoPlan.scenes[currentScene];
    if (!scene) { setIsPlaying(false); return; }

    sceneTimerRef.current = setTimeout(() => {
      if (currentScene < videoPlan.scenes.length - 1) {
        setCurrentScene(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setCurrentScene(0);
      }
    }, scene.duration * 1000);

    return () => { if (sceneTimerRef.current) clearTimeout(sceneTimerRef.current); };
  }, [isPlaying, currentScene, videoPlan]);

  const togglePlay = () => {
    if (!videoPlan) return;
    const newPlaying = !isPlaying;
    setIsPlaying(newPlaying);
    if (audioRef.current) {
      newPlaying ? audioRef.current.play().catch(() => {}) : audioRef.current.pause();
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
    if (!isFullscreen) playerRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFullscreen(prev => !prev);
  };

  const toggleMute = () => {
    if (audioRef.current) audioRef.current.muted = !isMuted;
    setIsMuted(prev => !prev);
  };

  const resetVideo = () => {
    setCurrentScene(0);
    setIsPlaying(false);
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.pause(); }
  };

  // ── Export as downloadable images + script bundle ──────────

  const exportVideo = useCallback(async () => {
    if (!videoPlan) return;
    setIsExporting(true);
    try {
      // Build a comprehensive HTML file that can be opened offline as a slideshow
      const scenesHtml = videoPlan.scenes.map((s, i) => {
        const imgSrc = sceneImages[s.sceneNumber];
        return `
        <div class="scene" id="scene-${i}" style="display:${i === 0 ? 'flex' : 'none'}">
          ${imgSrc ? `<img src="${imgSrc}" class="scene-bg" alt="Scene ${i + 1}" />` : ''}
          <div class="scene-overlay">
            <div class="scene-badge">${s.visualType.replace(/_/g, ' ')}</div>
            <h2>${s.emoji || ''} ${s.title}</h2>
            <p class="narration">${s.narration}</p>
            ${s.bulletPoints?.length ? `<ul>${s.bulletPoints.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
          </div>
          <div class="scene-counter">${i + 1} / ${videoPlan.scenes.length}</div>
        </div>`;
      }).join('\n');

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${videoPlan.chapterTitle} — Video</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden;height:100vh}
.scene{position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;padding:4rem}
.scene-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.5;z-index:0}
.scene-overlay{position:relative;z-index:1;text-align:center;max-width:700px;background:rgba(0,0,0,0.5);padding:2rem;border-radius:1rem;backdrop-filter:blur(8px)}
.scene-overlay h2{font-size:2rem;margin-bottom:1rem}
.narration{font-size:1.1rem;opacity:0.85;line-height:1.6}
.scene-overlay ul{text-align:left;margin-top:1rem;list-style:disc;padding-left:1.5rem}
.scene-overlay ul li{margin:0.4rem 0;opacity:0.9}
.scene-badge{display:inline-block;background:rgba(255,255,255,0.15);padding:4px 12px;border-radius:999px;font-size:0.75rem;margin-bottom:0.75rem;text-transform:capitalize}
.scene-counter{position:absolute;bottom:1.5rem;right:1.5rem;opacity:0.5;font-size:0.8rem;z-index:2}
.controls{position:fixed;bottom:0;left:0;right:0;z-index:10;background:rgba(0,0,0,0.9);padding:1rem;display:flex;justify-content:center;gap:1rem}
.controls button{background:rgba(255,255,255,0.15);border:none;color:#fff;padding:0.5rem 1.5rem;border-radius:0.5rem;cursor:pointer;font-size:0.9rem}
.controls button:hover{background:rgba(255,255,255,0.3)}
</style>
</head>
<body>
${scenesHtml}
<div class="controls">
<button onclick="prev()">← Previous</button>
<button onclick="toggleAutoplay()" id="playBtn">▶ Autoplay</button>
<button onclick="next()">Next →</button>
</div>
<script>
let current=0,total=${videoPlan.scenes.length},timer=null,durations=[${videoPlan.scenes.map(s => s.duration).join(',')}];
function show(n){document.querySelectorAll('.scene').forEach((s,i)=>{s.style.display=i===n?'flex':'none'});current=n}
function next(){if(current<total-1)show(current+1);else{show(0);if(timer){clearInterval(timer);timer=null;document.getElementById('playBtn').textContent='▶ Autoplay'}}}
function prev(){if(current>0)show(current-1)}
function toggleAutoplay(){if(timer){clearInterval(timer);timer=null;document.getElementById('playBtn').textContent='▶ Autoplay'}else{document.getElementById('playBtn').textContent='⏸ Pause';advance()}}
function advance(){timer=setTimeout(()=>{next();if(timer)advance()},durations[current]*1000)}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();if(e.key===' '){e.preventDefault();toggleAutoplay()}});
</script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoPlan.chapterTitle.replace(/[^a-zA-Z0-9]/g, '_')}_video.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Video exported! 📥", description: "Open the HTML file in any browser for a full slideshow experience with graphics." });
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : "Please try again" });
    } finally {
      setIsExporting(false);
    }
  }, [videoPlan, sceneImages, toast]);

  const scene = videoPlan?.scenes[currentScene];
  const transition = transitionVariants[scene?.transition || "fade"] || transitionVariants.fade;
  const sceneProgress = videoPlan ? ((currentScene + 1) / videoPlan.scenes.length) * 100 : 0;
  const currentSceneImage = scene ? sceneImages[scene.sceneNumber] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div ref={playerRef} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className={cn("relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl", isFullscreen && "max-w-none rounded-none")}>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-white" />
            <span className="text-white font-semibold text-sm truncate max-w-[200px]">{chapterTitle}</span>
            <Badge variant="outline" className="text-white border-white/30 text-xs">{tierLabel}</Badge>
            <Badge variant="outline" className="text-white border-white/30 text-xs capitalize">{bookType}</Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Main Canvas */}
        <div className={cn("relative aspect-video bg-gradient-to-br", theme.gradient, "flex items-center justify-center", theme.textClass)}>

          {/* AI-generated scene background image */}
          {currentSceneImage && (
            <motion.img
              key={`img-${currentScene}`}
              src={currentSceneImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
            />
          )}

          {/* Image generation indicator */}
          {isGeneratingImages && (
            <div className="absolute top-16 left-4 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-white/70 animate-pulse" />
              <span className="text-white/70 text-xs">Generating graphics... {imageGenProgress}%</span>
            </div>
          )}

          {/* Generating */}
          {isGenerating && (
            <div className="flex flex-col items-center gap-4 text-white">
              <Loader2 className="h-12 w-12 animate-spin" />
              <p className="text-lg font-medium">Creating {bookType} video...</p>
              <Progress value={generationProgress} className="w-64 h-2" />
              <p className="text-sm text-white/60">
                {generationProgress < 30 ? "Analyzing chapter content..." :
                 generationProgress < 80 ? `Building ${bookType} scenes...` :
                 hasTTS ? "Generating narration audio..." : "Finalizing..."}
              </p>
            </div>
          )}

          {/* Pre-generation CTA */}
          {!isGenerating && !videoPlan && (
            <div className="flex flex-col items-center gap-6 text-white p-8 text-center">
              <div className="text-6xl">{theme.icon}</div>
              <h2 className="text-2xl font-bold">Chapter Video Generator</h2>
              <p className="text-white/70 max-w-md">
                Transform "{chapterTitle}" into a {bookType === "children" ? "magical animated story" :
                bookType === "professional" ? "executive briefing video" :
                bookType === "comic" ? "dynamic visual narrative" :
                bookType === "workbook" ? "interactive tutorial video" :
                bookType === "bestseller" ? "TED-Talk style presentation" :
                "cinematic learning experience"} with AI-generated graphics
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Badge className="bg-white/20 text-white">✓ AI Scene Graphics</Badge>
                <Badge className="bg-white/20 text-white">✓ {bookType === "comic" ? "Panel Animations" : "Animated Slides"}</Badge>
                <Badge className={cn("text-white", tier === "premium" || tier === "prophet_tier" ? "bg-white/20" : "bg-white/10 opacity-50")}>
                  {tier === "premium" || tier === "prophet_tier" ? "✓" : "🔒"} {bookType === "children" ? "Warm Voice" : "Pro Narration"}
                </Badge>
              </div>
              <Button size="lg" onClick={generateVideo} className="bg-white text-black hover:bg-white/90 font-semibold gap-2">
                <Sparkles className="h-5 w-5" />
                Generate Video
              </Button>
            </div>
          )}

          {/* Scene Player */}
          {videoPlan && scene && (
            <AnimatePresence mode="wait">
              <motion.div key={currentScene} {...transition} transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 md:p-16">

                <div className="absolute top-16 right-4 flex items-center gap-2">
                  <Badge className={cn("text-white/80 text-xs", theme.accent)}>
                    {scene.visualType.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-white/50 text-xs">{currentScene + 1}/{videoPlan.scenes.length}</span>
                </div>

                <SceneRenderer scene={scene} bookType={bookType} bookTitle={bookTitle} />

                {isPlaying && !["title_card", "story_opening", "quiz_prompt", "reflection_question"].includes(scene.visualType) && (
                  <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-24 left-8 right-8">
                    <p className="text-white/60 text-sm text-center italic bg-black/30 rounded-lg px-4 py-2 backdrop-blur-sm line-clamp-2">
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
                {currentScene + 1}/{videoPlan.scenes.length} · ~{Math.round(videoPlan.totalDuration / 60)}min
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={exportVideo} disabled={isExporting}
                  className="text-white hover:bg-white/10 h-8 w-8" title="Download video">
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
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
