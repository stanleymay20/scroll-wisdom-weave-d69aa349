/**
 * Progressive video generation pipeline hook.
 * Handles scripting, image generation, and TTS narration in batches.
 */
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CinematicScene } from "./types";
import type { useVideoNarration } from "./useVideoNarration";

interface UseVideoGenerationOptions {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  bookType: string;
  tier: string;
  language: string;
  chapterNumber: number;
  narration: ReturnType<typeof useVideoNarration>;
  hasCinematicAccess: boolean;
  // State setters from useVideoPlayer
  setScenes: (scenes: CinematicScene[] | ((prev: CinematicScene[]) => CinematicScene[])) => void;
  setReadyCount: (count: number) => void;
  setIsGenerating: (v: boolean) => void;
  setPhase: (phase: any) => void;
  setProgress: (p: number) => void;
  setProgressLabel: (l: string) => void;
  setAutoPlayTriggered: (v: boolean) => void;
  imageBlobUrlsRef: React.MutableRefObject<string[]>;
}

export function useVideoGeneration({
  chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber,
  narration, hasCinematicAccess,
  setScenes, setReadyCount, setIsGenerating, setPhase, setProgress, setProgressLabel,
  setAutoPlayTriggered, imageBlobUrlsRef,
}: UseVideoGenerationOptions) {

  const generateVideo = useCallback(async (
    toast: (opts: any) => void,
  ) => {
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
  }, [chapterContent, chapterTitle, bookTitle, bookType, tier, language, chapterNumber, hasCinematicAccess, narration]);

  return { generateVideo };
}
