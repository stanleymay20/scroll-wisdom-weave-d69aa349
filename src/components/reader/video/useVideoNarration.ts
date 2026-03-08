/**
 * Hook to generate and manage TTS narration audio for video scenes.
 * Uses the existing text-to-speech edge function.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CinematicScene } from "./types";

interface NarrationState {
  isGenerating: boolean;
  progress: number;
  audioElements: Map<number, HTMLAudioElement>;
  error: string | null;
}

export function useVideoNarration() {
  const [state, setState] = useState<NarrationState>({
    isGenerating: false,
    progress: 0,
    audioElements: new Map(),
    error: null,
  });

  const audioMapRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  // Generate narration audio for all scenes
  const generateNarration = useCallback(async (scenes: CinematicScene[]): Promise<CinematicScene[]> => {
    abortRef.current = false;
    setState(s => ({ ...s, isGenerating: true, progress: 0, error: null }));

    const updatedScenes = [...scenes];
    const total = scenes.length;

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      const scene = scenes[i];
      if (!scene.narration?.trim()) continue;

      try {
        const { data, error } = await supabase.functions.invoke("text-to-speech", {
          body: { text: scene.narration, voice: "onyx" },
        });

        if (error || !data?.audioContent) {
          console.warn(`[VideoNarration] Scene ${scene.sceneNumber} TTS failed:`, error);
          continue;
        }

        // Create audio element from base64
        const audioBlob = base64ToBlob(data.audioContent, "audio/mpeg");
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        // Wait for metadata to get duration
        await new Promise<void>((resolve) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => resolve(), { once: true });
          audio.load();
        });

        const audioDuration = audio.duration && isFinite(audio.duration) ? audio.duration : 0;

        updatedScenes[i] = {
          ...updatedScenes[i],
          audioUrl,
          // Use audio duration if longer than planned scene duration
          duration: audioDuration > 0 ? Math.max(updatedScenes[i].duration, Math.ceil(audioDuration) + 1) : updatedScenes[i].duration,
          audioDuration,
        };

        audioMapRef.current.set(scene.sceneNumber, audio);
      } catch (err) {
        console.warn(`[VideoNarration] Scene ${scene.sceneNumber} error:`, err);
      }

      setState(s => ({ ...s, progress: Math.round(((i + 1) / total) * 100) }));
    }

    setState(s => ({
      ...s,
      isGenerating: false,
      progress: 100,
      audioElements: new Map(audioMapRef.current),
    }));

    return updatedScenes;
  }, []);

  // Play audio for a specific scene
  const playSceneAudio = useCallback((sceneNumber: number) => {
    // Stop current
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }

    const audio = audioMapRef.current.get(sceneNumber);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      currentAudioRef.current = audio;
    }
  }, []);

  // Pause current audio
  const pauseAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
  }, []);

  // Resume current audio
  const resumeAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.play().catch(() => {});
    }
  }, []);

  // Stop all audio
  const stopAllAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  // Set volume (0-1)
  const setVolume = useCallback((volume: number) => {
    audioMapRef.current.forEach(audio => {
      audio.volume = volume;
    });
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      abortRef.current = true;
      audioMapRef.current.forEach(audio => {
        audio.pause();
        if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
      });
      audioMapRef.current.clear();
    };
  }, []);

  return {
    ...state,
    generateNarration,
    playSceneAudio,
    pauseAudio,
    resumeAudio,
    stopAllAudio,
    setVolume,
  };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const byteArrays: Uint8Array[] = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mime });
}
