/**
 * Hook to generate and manage TTS narration audio for video scenes.
 * Exposes per-scene generation for progressive pipeline.
 */
import { useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CinematicScene } from "./types";

export function useVideoNarration() {
  const audioMapRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);
  const volumeRef = useRef(0.8);

  // Generate a single scene's narration — exposed for progressive pipeline
  const generateSingleNarration = useCallback(async (scene: CinematicScene): Promise<{
    sceneNumber: number;
    audioUrl?: string;
    audioDuration?: number;
    audio?: HTMLAudioElement;
  } | null> => {
    if (!scene.narration?.trim()) return null;

    try {
      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: { text: scene.narration, voice: "onyx" },
      });

      if (error || !data?.audioContent) {
        console.warn(`[VideoNarration] Scene ${scene.sceneNumber} TTS failed:`, error);
        return null;
      }

      const audioBlob = base64ToBlob(data.audioContent, "audio/mpeg");
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
        audio.addEventListener("error", () => resolve(), { once: true });
        audio.load();
      });

      const audioDuration = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
      return { sceneNumber: scene.sceneNumber, audioUrl, audioDuration, audio };
    } catch (err) {
      console.warn(`[VideoNarration] Scene ${scene.sceneNumber} error:`, err);
      return null;
    }
  }, []);

  // Register a pre-generated audio element (applies current volume)
  const registerAudio = useCallback((sceneNumber: number, audio: HTMLAudioElement) => {
    audio.volume = volumeRef.current;
    audioMapRef.current.set(sceneNumber, audio);
  }, []);

  const playSceneAudio = useCallback((sceneNumber: number) => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
    const audio = audioMapRef.current.get(sceneNumber);
    if (audio) {
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      audio.play().catch(() => {});
      currentAudioRef.current = audio;
    }
  }, []);

  const pauseAudio = useCallback(() => { currentAudioRef.current?.pause(); }, []);
  
  const resumeAudio = useCallback(() => { 
    currentAudioRef.current?.play().catch(() => {}); 
  }, []);

  const stopAllAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    audioMapRef.current.forEach(audio => { audio.volume = volume; });
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = volume;
    }
  }, []);

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
    generateSingleNarration,
    registerAudio,
    playSceneAudio,
    pauseAudio,
    resumeAudio,
    stopAllAudio,
    setVolume,
  };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const byteArrays: BlobPart[] = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers) as unknown as BlobPart);
  }
  return new Blob(byteArrays, { type: mime });
}