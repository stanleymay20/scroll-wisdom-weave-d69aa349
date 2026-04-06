/**
 * CONTRACT 5 - Rule 5.3 & 5.4: Audio Reliability (HARD ENFORCEMENT)
 * 
 * This component MUST:
 * - Respond to user actions within 100ms (Rule 5.6)
 * - Never pause silently without explanation
 * - Show buffering state when loading
 * - Resume after interruptions (tab switch, phone call)
 * - Survive screen lock via Media Session API
 */

import { useState, useRef, useCallback, useEffect, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Settings, 
  Loader2, 
  Square, 
  X,
  AlertCircle,
  Mic,
  RotateCcw,
  SkipForward
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useAudioReliability, AUDIO_CHUNK_SIZES } from "@/hooks/useAudioReliability";
import { audioPositionManager } from "@/lib/audioPositionPersistence";
import { useGlobalAudio } from "@/contexts/AudioContext";
import { cn } from "@/lib/utils";

// OpenAI TTS voices
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy" },
  { id: "echo", name: "Echo" },
  { id: "fable", name: "Fable" },
  { id: "onyx", name: "Onyx" },
  { id: "nova", name: "Nova" },
  { id: "shimmer", name: "Shimmer" },
];

const SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const TTS_REQUEST_TIMEOUT_MS = 15000;
const TTS_PLAYBACK_START_TIMEOUT_MS = 10000;
const SESSION_LOOKUP_TIMEOUT_MS = 1500;
const AUDIO_UNLOCK_TIMEOUT_MS = 300;

interface TTSChunkPayload {
  audioContent: string;
  contentType?: string;
  error?: string;
}

function isLikelyBase64Audio(value: unknown): value is string {
  return typeof value === "string" && value.length > 128 && /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function base64ToBlob(base64: string, mimeType = "audio/mpeg") {
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

  return new Blob(byteArrays, { type: mimeType });
}

function revokeObjectUrl(url?: string | null) {
  if (!url?.startsWith("blob:")) return;

  try {
    URL.revokeObjectURL(url);
  } catch {
    /* noop */
  }
}

interface TTSMiniPlayerProps {
  /** Full chapter text for "Read Chapter" */
  chapterText: string;
  /** Optional selected text for quick reading */
  selectedText?: string;
  language?: string;
  onClose?: () => void;
  /** Force stop when this key changes (e.g. on chapter change) */
  stopKey?: string | number;
  /** Book/chapter title for media session */
  title?: string;
  /** Book author for media session */
  author?: string;
  /** Book ID for position persistence */
  bookId?: string;
  /** Chapter ID for position persistence */
  chapterId?: string;
  /** Callback when user wants to ask a question (Interactive Guard Mode) */
  onInterrupt?: () => void;
  /** Callback when chapter audio completes - used for auto-continue */
  onChapterComplete?: () => void;
  /** Whether auto-continue to next chapter is enabled */
  autoContinue?: boolean;
  /** Current chapter number (for display) */
  currentChapter?: number;
  /** Total chapters in book */
  totalChapters?: number;
  /** Callback when playing state changes - for auto-scroll sync */
  onPlayingChange?: (isPlaying: boolean) => void;
  /** Expose audioRef for external sync (sentence highlighting) */
  onAudioRefChange?: (ref: HTMLAudioElement | null) => void;
  /** Expose cumulative playback time for sync across chunks */
  onCumulativeTimeChange?: (seconds: number) => void;
  /** Expose estimated total audio duration (refined from actual chunk durations) */
  onEstimatedDurationChange?: (seconds: number) => void;
  /** Auto-play chapter on mount (for auto-continue between chapters) */
  autoPlay?: boolean;
  /** Callback with chunk playback info for word-level sync */
  onChunkPlaybackInfo?: (info: { chunkIndex: number; chunkWordCounts: number[] }) => void;
  /** Callback when playback speed changes — needed for block-level timestamp alignment */
  onPlaybackSpeedChange?: (speed: number) => void;
  /** Adaptive learning engine recommended speed (overrides default 1.0) */
  adaptiveSpeed?: number;
}

export const TTSMiniPlayer = forwardRef<HTMLDivElement, TTSMiniPlayerProps>(function TTSMiniPlayer({ 
  chapterText, 
  selectedText, 
  language = "en", 
  onClose,
  stopKey,
  title = "Chapter",
  author = "ScrollLibrary",
  bookId,
  chapterId,
  onInterrupt,
  onChapterComplete,
  autoContinue = false,
  currentChapter,
  totalChapters,
  onPlayingChange,
  onAudioRefChange,
  onCumulativeTimeChange,
  onEstimatedDurationChange,
  autoPlay = false,
  onChunkPlaybackInfo,
  onPlaybackSpeedChange,
  adaptiveSpeed,
}, ref) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(adaptiveSpeed || 1.0);
  const playbackSpeedRef = useRef(adaptiveSpeed || 1.0);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [progress, setProgress] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [mode, setMode] = useState<"chapter" | "selection">("chapter");
  // Track current position for resume (Interactive Guard Mode - Rule 5.4)
  const [currentPosition, setCurrentPosition] = useState(0);
  const pausedAtChunkRef = useRef(0);
  // Cumulative playback time across chunks (for sentence sync)
  const cumulativeTimeRef = useRef(0);
  // Track audio-seconds-per-character to estimate total duration accurately
  const totalAudioSecsRef = useRef(0);
  const totalAudioCharsRef = useRef(0);
  const fullTextLengthRef = useRef(0);
  const endedChunkCountRef = useRef(0);

  const stopRef = useRef(false);
  const isStoppingRef = useRef(false);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const prevStopKeyRef = useRef<string | number | undefined>(undefined);
  const isMountedRef = useRef(true);
  const chunksRef = useRef<string[]>([]);
  // Track if audio context is unlocked (user has interacted)
  const audioUnlockedRef = useRef(false);
  // Track if playback was blocked by browser autoplay policy
  const autoplayBlockedRef = useRef(false);
  const { toast } = useToast();
  const entitlements = useEntitlements();
  const { audioRef, update: updateGlobalAudio, stopAndClear: stopGlobalAudio, registerControls } = useGlobalAudio();
  
  // CONTRACT 5 - Rule 5.3: Audio reliability tracking
  const audioReliability = useAudioReliability({
    id: 'tts-mini-player',
    onVisibilityResume: () => {
      // Resume playback when tab becomes visible again
      if (pausedAtChunkRef.current > 0 && chunksRef.current.length > 0) {
        resumeFromPosition();
      }
    },
    onError: (err) => {
      setError(err);
    },
  });
  
  // CONTRACT 5 - Rule 5.3: Media Session API for OS-resilient audio
  const mediaSession = useMediaSession({
    id: 'tts-mini-player',
    title,
    artist: author,
    album: 'ScrollLibrary Reading',
    onPlay: () => {
      if (!isPlaying && !isLoading) {
        resumeFromPosition();
      }
    },
    onPause: () => {
      pauseForInteraction();
    },
    onStop: () => {
      stop();
    },
  });

  const hasAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || 
                   entitlements.isScrollStudent || entitlements.isPaid || entitlements.canUseTTS;

  // Track mounted state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Report playing state changes for auto-scroll sync
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const sanitizeText = useCallback((raw: string) => {
    return raw
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, " ")
      .replace(/#{1,6}\s*/g, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]+`/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }, []);

  // CONTRACT 5 - Rule 5.3: Optimized chunking for instant audio start
  // First chunk MUST be ≤120 chars for sub-second TTS response
  const chunkText = useCallback((input: string, maxChars = 500) => {
    const text = input.trim();
    if (!text) return [];

    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = "";
    let isFirstChunk = true;

    for (const s of sentences) {
      // First chunk: max 120 chars for instant playback
      const chunkLimit = isFirstChunk ? 120 : maxChars;
      
      if (!current) {
        current = s;
        // If first sentence exceeds limit, split it
        if (isFirstChunk && current.length > chunkLimit) {
          chunks.push(current.slice(0, chunkLimit));
          current = current.slice(chunkLimit).trim();
          isFirstChunk = false;
        }
        continue;
      }
      
      if ((current + " " + s).length <= chunkLimit) {
        current = current + " " + s;
      } else {
        chunks.push(current);
        current = s;
        isFirstChunk = false;
      }
    }
    if (current) chunks.push(current);
    if (chunks.length === 0) return [text.slice(0, 120)];
    return chunks;
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    const currentSrc = audioRef.current?.currentSrc || audioRef.current?.src || "";

    activeBlobUrlsRef.current.forEach((url) => {
      if (url !== currentSrc) {
        revokeObjectUrl(url);
      }
    });

    activeBlobUrlsRef.current = currentSrc.startsWith("blob:") ? [currentSrc] : [];
  }, [audioRef]);

  const ensureAudioElement = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    audio.preload = "auto";
    audio.volume = volume;
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");

    return audio;
  }, [audioRef, volume]);

  const resetPlaybackState = useCallback((nextError: string | null = null) => {
    stopRef.current = true;
    autoplayBlockedRef.current = false;
    audioUnlockedRef.current = false;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.onplay = null;
        audioRef.current.onended = null;
        audioRef.current.onpause = null;
        audioRef.current.onerror = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.onloadedmetadata = null;
        audioRef.current.onwaiting = null;
        audioRef.current.oncanplay = null;
        audioRef.current.removeAttribute("src");
        audioRef.current.src = "";
        audioRef.current.muted = false;
      } catch {
        try {
          audioRef.current.src = "";
          audioRef.current.muted = false;
        } catch {
          /* noop */
        }
      }
    }

    cleanupBlobUrls();
    mediaSession.setPlaybackState('idle');
    audioReliability.setState(nextError ? 'error' : 'idle');

    if (isMountedRef.current) {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setError(nextError);
    }
  }, [audioRef, cleanupBlobUrls, mediaSession, audioReliability]);

  const base64ToBlobUrl = useCallback((base64: string, mimeType = "audio/mpeg") => {
    return URL.createObjectURL(base64ToBlob(base64, mimeType));
  }, []);

  const requestTTSChunk = useCallback(async (chunk: string): Promise<TTSChunkPayload> => {
    const body = { text: chunk, voice: selectedVoice, language };

    const parsePayload = (payload: unknown): TTSChunkPayload => {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid TTS response");
      }

      const data = payload as TTSChunkPayload;

      if (data.error) {
        throw new Error(data.error);
      }

      if (!isLikelyBase64Audio(data.audioContent)) {
        throw new Error("Invalid audio content received");
      }

      return data;
    };

    const ttsUrl = import.meta.env.VITE_SUPABASE_URL
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`
      : null;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (ttsUrl && publishableKey) {
      try {
        let session: { access_token?: string } | null = null;

        try {
          const sessionResult = await withTimeout(
            supabase.auth.getSession(),
            SESSION_LOOKUP_TIMEOUT_MS,
            "Session lookup timed out"
          );
          session = sessionResult.data.session ?? null;
        } catch (sessionError) {
          console.warn("[TTS] Session lookup failed, continuing without user token", sessionError);
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
          apikey: publishableKey,
          "Cache-Control": "no-store",
          Authorization: `Bearer ${session?.access_token ?? publishableKey}`,
        };

        console.log("[TTS] Requesting chunk audio", {
          textLength: chunk.length,
          hasSession: !!session?.access_token,
          voice: selectedVoice,
          language,
        });

        const response = await withTimeout(
          fetch(ttsUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            cache: "no-store",
          }),
          TTS_REQUEST_TIMEOUT_MS,
          "TTS request timed out"
        );

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : `TTS request failed (${response.status})`;
          throw new Error(message);
        }

        return parsePayload(data);
      } catch (directFetchError) {
        console.warn("[TTS] Direct fetch failed, falling back to SDK invoke", directFetchError);
      }
    }

    const result = await withTimeout(
      supabase.functions.invoke("text-to-speech", { body }),
      TTS_REQUEST_TIMEOUT_MS,
      "TTS request timed out"
    );

    if (result.error) {
      throw new Error(result.error.message || "TTS request failed");
    }

    return parsePayload(result.data);
  }, [language, selectedVoice]);

  const fetchChunkAudioUrl = useCallback(async (chunk: string, retries = 2): Promise<string | null> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (stopRef.current) return null;

      try {
        const data = await requestTTSChunk(chunk);

        if (stopRef.current) return null;

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);
        return url;
      } catch (err) {
        console.error(`[TTS] Chunk fetch error (attempt ${attempt + 1}):`, err);

        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
      }
    }

    return null;
  }, [base64ToBlobUrl, requestTTSChunk]);

  // Unlock audio context on user gesture - call this synchronously in click handler
  const unlockAudio = useCallback(async () => {
    if (audioUnlockedRef.current) return true;

    const audio = ensureAudioElement();

    const restoreAudioElement = () => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch {
        try {
          audio.muted = false;
        } catch {
          /* noop */
        }
      }
    };

    try {
      audio.pause();
      audio.muted = true;
      if (audio.src !== SILENT_WAV_DATA_URI) {
        audio.src = SILENT_WAV_DATA_URI;
      }
      audio.currentTime = 0;
      const playAttempt = audio.play();
      
      audioUnlockedRef.current = true;
      autoplayBlockedRef.current = false;
      console.log("[TTS] Priming shared audio element from user gesture");

      if (!playAttempt || typeof playAttempt.then !== "function") {
        restoreAudioElement();
        return true;
      }

      let unlockTimedOut = false;
      const unlocked = await Promise.race<boolean>([
        playAttempt
          .then(() => true)
          .catch((err) => {
            if (unlockTimedOut) {
              console.warn("[TTS] Audio unlock settled after timeout", err);
              return true;
            }

            if (err?.name === "NotAllowedError") {
              audioUnlockedRef.current = false;
              autoplayBlockedRef.current = true;
              console.error("[TTS] Browser blocked audio unlock:", err);
              return false;
            }

            console.warn("[TTS] Audio unlock promise rejected after prime; continuing", err);
            return true;
          }),
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => {
            unlockTimedOut = true;
            console.warn("[TTS] Audio unlock timed out; continuing with primed element");
            resolve(true);
          }, AUDIO_UNLOCK_TIMEOUT_MS);
        }),
      ]);

      restoreAudioElement();
      return unlocked;
    } catch (err) {
      audioUnlockedRef.current = false;
      restoreAudioElement();
      autoplayBlockedRef.current = true;
      console.error("[TTS] Failed to unlock audio context:", err);
      return false;
    }
  }, [ensureAudioElement]);

  const primeAudioFromGesture = useCallback(() => {
    void unlockAudio();
  }, [unlockAudio]);

  const playUrl = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (stopRef.current) {
        resolve(false);
        return;
      }

      let resolved = false;
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      const audio = ensureAudioElement();
      audio.muted = false;
      audio.playbackRate = playbackSpeedRef.current;
      const previousSrc = audio.currentSrc || audio.src;
      let playbackStartTimeoutId: number | null = null;

      const clearPlaybackStartTimeout = () => {
        if (playbackStartTimeoutId !== null) {
          window.clearTimeout(playbackStartTimeoutId);
          playbackStartTimeoutId = null;
        }
      };

      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* noop */
      }
      
      // Expose audioRef for external sync (sentence highlighting)
      onAudioRefChange?.(audio);

      const cleanup = () => {
        clearPlaybackStartTimeout();
        audio.onplay = null;
        audio.onplaying = null;
        audio.onended = null;
        audio.onpause = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
        audio.onwaiting = null;
        audio.oncanplay = null;
      };
      
      // Emit estimated total duration as soon as chunk metadata is available
      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && fullTextLengthRef.current > 0) {
          const chunkIdx = endedChunkCountRef.current;
          const chunkText = chunksRef.current[chunkIdx];
          if (chunkText && chunkText.length > 0) {
            // Use this chunk's actual duration to estimate total
            const secsPerChar = audio.duration / chunkText.length;
            const estimatedTotal = secsPerChar * fullTextLengthRef.current;
            console.log(`[TTS Sync] Chunk ${chunkIdx} duration=${audio.duration.toFixed(1)}s, chars=${chunkText.length}, est total=${estimatedTotal.toFixed(0)}s`);
            onEstimatedDurationChange?.(estimatedTotal);
          }
        }
      };

      const markPlaying = () => {
        clearPlaybackStartTimeout();
        // Always apply latest speed when play starts
        audio.playbackRate = playbackSpeedRef.current;
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsPlaying(true);
          setError(null);
        }
        onPlayingChange?.(true);
      };

      audio.onplay = markPlaying;
      audio.onplaying = markPlaying;
      audio.oncanplay = () => {
        clearPlaybackStartTimeout();
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      };
      audio.onwaiting = () => {
        if (isMountedRef.current && !stopRef.current) {
          setIsLoading(true);
        }
      };
      
      audio.onended = () => {
        // Track cumulative time for sentence sync
        if (audio.duration && !isNaN(audio.duration)) {
          cumulativeTimeRef.current += audio.duration;
          onCumulativeTimeChange?.(cumulativeTimeRef.current);
          
          // Update actual duration estimate from real audio data
          totalAudioSecsRef.current += audio.duration;
          const chunkIdx = endedChunkCountRef.current;
          endedChunkCountRef.current++;
          if (chunksRef.current[chunkIdx]) {
            totalAudioCharsRef.current += chunksRef.current[chunkIdx].length;
          }
          // Estimate total audio duration from actual rate
          if (totalAudioCharsRef.current > 0 && fullTextLengthRef.current > 0) {
            const secsPerChar = totalAudioSecsRef.current / totalAudioCharsRef.current;
            const estimatedTotal = secsPerChar * fullTextLengthRef.current;
            onEstimatedDurationChange?.(estimatedTotal);
          }
        }
        cleanup();
        safeResolve(true);
      };
      
      audio.onpause = () => {
        // Only resolve false if user explicitly stopped — NOT on system pauses
        if (stopRef.current) {
          cleanup();
          if (isMountedRef.current) {
            setIsPlaying(false);
            onPlayingChange?.(false);
          }
          safeResolve(false);
        }
        // System pause (tab switch, phone call) — do NOT resolve, audio will resume
      };
      
      audio.onerror = () => {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsPlaying(false);
        }
        cleanup();
        safeResolve(false);
      };
      
      audio.ontimeupdate = () => {
        if (audio.duration && isMountedRef.current) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      // Set source and play — do NOT call audio.load() separately as it causes
      // race conditions with the play() promise on some browsers
      audio.src = url;
      if (previousSrc && previousSrc !== url) {
        revokeObjectUrl(previousSrc);
        activeBlobUrlsRef.current = activeBlobUrlsRef.current.filter((entry) => entry !== previousSrc);
      }

      playbackStartTimeoutId = window.setTimeout(() => {
        if (resolved || stopRef.current) return;

        console.error("[TTS] Audio start timed out");
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsPlaying(false);
          setError("Audio took too long to start. Tap play to retry.");
        }
        cleanup();
        safeResolve(false);
      }, TTS_PLAYBACK_START_TIMEOUT_MS);

      audio.play()
        .then(() => {
          markPlaying();
        })
        .catch((err) => {
          if (isMountedRef.current) {
            setIsLoading(false);
            setIsPlaying(false);
          }
          cleanup();
          if (err?.name === "NotAllowedError") {
            console.error("[TTS] Play blocked by autoplay policy — requires user gesture");
            audioUnlockedRef.current = false;
            autoplayBlockedRef.current = true;
            if (isMountedRef.current) {
              const message = "Audio was blocked by your browser. Tap play again to allow sound.";
              setError(message);
              toast({
                title: "Playback blocked",
                description: message,
                variant: "destructive",
              });
            }
          } else if (err?.name !== "AbortError") {
            console.error("[TTS] Play error:", err);
          }
          safeResolve(false);
        });
    });
  }, [ensureAudioElement, onPlayingChange, onAudioRefChange, toast]);

  // Full stop: destroys playback entirely, resets all state
  const stop = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    resetPlaybackState();
    mediaSession.deactivate();
    
    // Clear global audio state so floating player disappears
    stopGlobalAudio();
    
    // Reset paused position so next play starts fresh
    pausedAtChunkRef.current = 0;
    
    if (isMountedRef.current) {
      setCurrentChunk(0);
      setCurrentPosition(0);
    }
    
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 50);
  }, [resetPlaybackState, mediaSession, stopGlobalAudio]);
  
  // CONTRACT 5 - Rule 5.4: Pause for interaction (Interactive Guard Mode)
  const pauseForInteraction = useCallback(() => {
    if (!isPlaying) return;
    
    pausedAtChunkRef.current = currentChunk;
    
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch { /* ignore */ }
    }
    
    stopRef.current = true;
    mediaSession.setPlaybackState('paused');
    audioReliability.setState('paused');
    
    if (isMountedRef.current) {
      setIsPlaying(false);
      setIsLoading(false);
    }
    
    // Persist position for cross-session resume
    if (bookId && chapterId) {
      const chunkProgress = chunksRef.current.length > 0 
        ? Math.round((currentChunk / chunksRef.current.length) * 100) 
        : 0;
      audioPositionManager.savePosition(bookId, chapterId, currentChunk, chunkProgress, selectedVoice);
    }
    
    console.log('[TTS] Paused for interaction at chunk', currentChunk);
  }, [isPlaying, currentChunk, mediaSession, bookId, chapterId, selectedVoice, audioReliability]);
  
  // CONTRACT 5 - Rule 5.4: Resume from semantic position
  const resumeFromPosition = useCallback(() => {
    if (chunksRef.current.length === 0) {
      // No chunks loaded, start fresh
      return;
    }
    
    const resumeChunk = pausedAtChunkRef.current;
    console.log('[TTS] Resuming from chunk', resumeChunk, 'of', chunksRef.current.length);
    
    // Resume playback from the saved chunk position
    const remainingChunks = chunksRef.current.slice(resumeChunk);
    if (remainingChunks.length > 0) {
      generateSpeechFromChunks(remainingChunks, resumeChunk);
    }
  }, []);

  // Helper to generate speech from a list of chunks (for resume)
  const generateSpeechFromChunks = useCallback(async (chunks: string[], startIndex: number) => {
    if (!audioUnlockedRef.current) {
      const unlocked = await unlockAudio();
      if (!unlocked) {
        resetPlaybackState("Audio playback is blocked on this device until the browser allows sound.");
        return;
      }
    }

    stopRef.current = false;
    isStoppingRef.current = false;
    setIsLoading(true);
    setError(null);
    audioReliability.setState('loading');
    
    mediaSession.activate();
    mediaSession.setPlaybackState('playing');
    
    // Re-report chunk playback info so word-level sync works on resume
    const allChunks = chunksRef.current;
    if (allChunks.length > 0) {
      const chunkWordCounts = allChunks.map(c => c.split(/\s+/).filter(Boolean).length);
      onChunkPlaybackInfo?.({ chunkIndex: startIndex, chunkWordCounts });
    }

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current) break;

        const globalIndex = startIndex + i;
        setCurrentChunk(globalIndex + 1);
        setCurrentPosition(globalIndex);
        
        // Update chunk index for word-level sync
        if (allChunks.length > 0) {
          const chunkWordCounts = allChunks.map(c => c.split(/\s+/).filter(Boolean).length);
          onChunkPlaybackInfo?.({ chunkIndex: globalIndex, chunkWordCounts });
        }

        const url = await fetchChunkAudioUrl(chunks[i], 2);

        if (stopRef.current) break;
        if (!url) throw new Error("Failed to load audio for this section");

        if (i === 0 && isMountedRef.current) {
          setIsLoading(false);
          audioReliability.setState('playing');
        }

        const success = await playUrl(url);
        if (!success) break;
      }
    } catch (err) {
      console.error("[TTS] Resume error:", err);
      resetPlaybackState(err instanceof Error ? err.message : "TTS failed");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
      }
      mediaSession.setPlaybackState('idle');
      audioReliability.setState('idle');
    }
  }, [fetchChunkAudioUrl, playUrl, mediaSession, onChunkPlaybackInfo, onCumulativeTimeChange, onEstimatedDurationChange, audioReliability, resetPlaybackState, unlockAudio]);

  const generateSpeech = useCallback(async (textToRead: string, isSelection = false) => {
    // CRITICAL: Do NOT call resetPlaybackState() here — it calls audio.load()
    // which revokes the user-gesture unlock on mobile browsers.
    // Instead, do lightweight cleanup that preserves the audio element state.
    stopRef.current = true; // signal any running loop to stop
    autoplayBlockedRef.current = false;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.onplay = null;
        audioRef.current.onended = null;
        audioRef.current.onpause = null;
        audioRef.current.onerror = null;
        audioRef.current.ontimeupdate = null;
        audioRef.current.onloadedmetadata = null;
      } catch { /* noop */ }
    }
    cleanupBlobUrls();

    // CONTRACT 5.6: Immediate visual feedback - show loading as soon as cleanup finishes
    setIsLoading(true);
    setError(null);
    setMode(isSelection ? "selection" : "chapter");
    audioReliability.setState('loading');

    // CRITICAL: Unlock the SAME shared audio element on the original user gesture
    const unlocked = await unlockAudio();
    if (!unlocked) {
      const message = "Audio playback is blocked on this device until the browser allows sound.";
      resetPlaybackState(message);
      toast({
        title: "Audio couldn't start",
        description: message,
        variant: "destructive",
      });
      return;
    }
    
    // Ensure clean state — these MUST be false before chunk loop starts
    stopRef.current = false;
    isStoppingRef.current = false;
    autoplayBlockedRef.current = false;
    pausedAtChunkRef.current = 0;
    cumulativeTimeRef.current = 0;
    totalAudioSecsRef.current = 0;
    totalAudioCharsRef.current = 0;
    fullTextLengthRef.current = 0;
    endedChunkCountRef.current = 0;
    onCumulativeTimeChange?.(0);
    onEstimatedDurationChange?.(0);
    onAudioRefChange?.(null);
    
    const cleaned = sanitizeText(textToRead || '');
    if (!cleaned || cleaned.length < 20) {
      setIsLoading(false);
      toast({ title: "No text", description: "No readable text found", variant: "destructive" });
      return;
    }

    // Detect stub/placeholder content — warn user and don't auto-continue
    const stubPatterns = [
      /content is being generated/i,
      /coming soon/i,
      /placeholder/i,
      /full chapter content/i,
      /pending generation/i,
      /key topics/i, // outline-only stub pattern
    ];
    const isStubContent = cleaned.length < 1500 && stubPatterns.some(p => p.test(cleaned));
    if (isStubContent) {
      toast({ 
        title: "Chapter not ready", 
        description: "Generate this chapter first — tap the chapter title in the book page to generate its full content.", 
        variant: "destructive" 
      });
      setIsLoading(false);
      // Don't trigger auto-continue on stubs
      return;
    }

    fullTextLengthRef.current = cleaned.length;
    setProgress(0);

    // CONTRACT 5 - Rule 5.3: First chunk TINY (≤120 chars) for instant start
    let chunks = isSelection 
      ? [cleaned.slice(0, 800)] 
      : chunkText(cleaned, 500);

    // Store chunks for potential resume (Rule 5.4)
    chunksRef.current = chunks;
    setTotalChunks(chunks.length);
    
    // Build word counts per chunk for precise word-level sync
    const chunkWordCounts = chunks.map(c => c.split(/\s+/).filter(Boolean).length);
    onChunkPlaybackInfo?.({ chunkIndex: 0, chunkWordCounts });
    
    console.log("[TTS] Starting with", chunks.length, "chunks, total text:", cleaned.length, "chars");

    // Activate media session for OS controls (Rule 5.3)
    mediaSession.activate();
    mediaSession.setPlaybackState('playing');

    try {
      // Start prefetching first chunk immediately
      let nextChunkPromise: Promise<string | null> | null = fetchChunkAudioUrl(chunks[0]);
      
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current) {
          console.log("[TTS] Playback stopped at chunk", i);
          break;
        }

        setCurrentChunk(i + 1);
        setCurrentPosition(i);
        onChunkPlaybackInfo?.({ chunkIndex: i, chunkWordCounts });

        console.log("[TTS] Playing chunk", i + 1, "/", chunks.length);

        // Wait for current chunk audio (already being fetched)
        const currentUrl = await nextChunkPromise;
        
        if (!currentUrl) {
          console.log("[TTS] Failed to fetch chunk", i + 1, "- skipping to next");
          // Try to continue with next chunk instead of stopping entirely
          if (i + 1 < chunks.length) {
            nextChunkPromise = fetchChunkAudioUrl(chunks[i + 1]);
            continue;
          }
          break;
        }

        // Start prefetching NEXT chunk while current plays (gapless playback)
        if (i + 1 < chunks.length) {
          nextChunkPromise = fetchChunkAudioUrl(chunks[i + 1]);
        } else {
          nextChunkPromise = null;
        }

        if (i === 0 && isMountedRef.current) {
          setIsLoading(false);
          audioReliability.setState('playing');
          mediaSession.setPlaybackState('playing');
        }

        const success = await playUrl(currentUrl);
        
        if (!success) {
          console.log("[TTS] Playback of chunk", i + 1, "was interrupted");
          if (autoplayBlockedRef.current) {
            resetPlaybackState("Audio playback is blocked on this device until the browser allows sound.");
          }
          break;
        }
      }
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
        console.log("[TTS] Playback cancelled");
      } else {
        console.error("[TTS] Error:", err);
        const msg = err instanceof Error ? err.message : "TTS failed";
        if (isMountedRef.current) {
          setError(msg);
          mediaSession.setPlaybackState('idle');
          audioReliability.setState('error');
          toast({ title: "TTS Error", description: msg, variant: "destructive" });
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
        setProgress(0);
        setCurrentChunk(0);
        
        // AUTO-CONTINUE: Only if chapter finished naturally (not stopped by user)
        if (!stopRef.current && mode === 'chapter' && autoContinue) {
          console.log("[TTS] Chapter complete - triggering auto-continue");
          onChapterComplete?.();
        }
      }
      mediaSession.setPlaybackState('idle');
      cleanupBlobUrls();
      if (!stopRef.current && !autoplayBlockedRef.current) {
        audioReliability.setState('idle');
      }
    }
  }, [sanitizeText, chunkText, cleanupBlobUrls, playUrl, toast, mediaSession, unlockAudio, autoContinue, onChapterComplete, audioReliability, resetPlaybackState, audioRef, onCumulativeTimeChange, onEstimatedDurationChange, onAudioRefChange, fetchChunkAudioUrl]);

  // Stop on stopKey change (page navigation)
  useEffect(() => {
    if (stopKey === undefined) return;
    if (prevStopKeyRef.current !== undefined && prevStopKeyRef.current !== stopKey) {
      console.log("[TTS] Stop key changed, stopping playback");
      stop();
    }
    prevStopKeyRef.current = stopKey;
  }, [stopKey, stop]);

  // AUTO-PLAY: When autoPlay is true and chapter text is available, start playing automatically
  const autoPlayTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoPlay && chapterText && !isPlaying && !isLoading && !autoPlayTriggeredRef.current) {
      autoPlayTriggeredRef.current = true;
      // Small delay to let component mount and chapter content settle
      const timer = setTimeout(() => {
        console.log("[TTS] Auto-play triggered for new chapter");
        generateSpeech(chapterText, false);
      }, 500);
      return () => clearTimeout(timer);
    }
    // Reset trigger when stopKey (chapter) changes
    if (!autoPlay) {
      autoPlayTriggeredRef.current = false;
    }
  }, [autoPlay, chapterText, isPlaying, isLoading]);

  // Cleanup on unmount — SAVE position before destroying
  // Sync playing state to global context so GlobalAudioPlayer knows what's happening
  useEffect(() => {
    const [derivedBookTitle, ...chapterParts] = title.split(" - ");
    const derivedChapterTitle = chapterParts.join(" - ") || title;

    updateGlobalAudio({
      bookId: bookId || null,
      chapterId: chapterId || null,
      chapterNumber: currentChapter || null,
      readerPath: bookId && currentChapter ? `/read/${bookId}/${currentChapter}` : null,
      bookTitle: derivedBookTitle || author,
      chapterTitle: derivedChapterTitle,
      voice: selectedVoice,
      chunkIndex: currentChunk,
      totalChunks,
      isPlaying,
      isLoading,
      progress,
    });
  }, [updateGlobalAudio, isPlaying, isLoading, currentChunk, totalChunks, progress, bookId, chapterId, currentChapter, title, author, selectedVoice]);

  // Cleanup on unmount — persist position but DON'T destroy audio if still playing
  useEffect(() => {
    return () => {
      if (bookId && chapterId && currentChunk > 0 && chunksRef.current.length > 0) {
        const chunkProgress = Math.round((currentChunk / chunksRef.current.length) * 100);
        audioPositionManager.savePosition(bookId, chapterId, currentChunk, chunkProgress, selectedVoice);
        console.log('[TTS] Saved position on unmount:', currentChunk);
      }
      
      if (!audioRef.current || audioRef.current.paused) {
        stopRef.current = true;
        isStoppingRef.current = true;
      }
      cleanupBlobUrls();
    };
  }, [cleanupBlobUrls, bookId, chapterId, currentChunk, selectedVoice, isPlaying, title, audioRef]);

  // Update volume on active audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handlePlayChapter = () => {
    if (isLoading) return;
    if (isPlaying) {
      // TRUE PAUSE: pause the audio element and save chunk position for resume
      pauseForInteraction();
      return;
    }
    primeAudioFromGesture();
    // If we have a saved position from this session, resume from there
    if (pausedAtChunkRef.current > 0 && chunksRef.current.length > 0) {
      resumeFromPosition();
      return;
    }
    // Check persisted position from previous session — re-chunk text first, then resume
    if (bookId && chapterId) {
      const saved = audioPositionManager.getPosition(bookId, chapterId);
      if (saved && saved.chunkIndex > 0) {
        console.log('[TTS] Found persisted position at chunk', saved.chunkIndex, '— resuming');
        // Re-chunk the text, set chunks, then resume from saved position
        const cleaned = sanitizeText(chapterText || '');
        if (cleaned && cleaned.length >= 20) {
          const chunks = chunkText(cleaned, 500);
          chunksRef.current = chunks;
          setTotalChunks(chunks.length);
          fullTextLengthRef.current = cleaned.length;
          if (saved.chunkIndex < chunks.length) {
            pausedAtChunkRef.current = saved.chunkIndex;
            if (saved.voice) setSelectedVoice(saved.voice);
            resumeFromPosition();
            return;
          }
        }
      }
    }
    generateSpeech(chapterText, false);
  };

  const handlePlaySelection = () => {
    if (!selectedText || isLoading) return;
    if (isPlaying && mode === "selection") {
      stop();
    } else {
      primeAudioFromGesture();
      generateSpeech(selectedText, true);
    }
  };

  useEffect(() => {
    registerControls({
      pause: pauseForInteraction,
      play: () => {
        primeAudioFromGesture();
        if (pausedAtChunkRef.current > 0 && chunksRef.current.length > 0) {
          resumeFromPosition();
          return;
        }

        if (!isPlaying && !isLoading) {
          generateSpeech(mode === "selection" && selectedText ? selectedText : chapterText, mode === "selection");
        }
      },
      stop,
    });

    return () => {
      registerControls(null);
    };
  }, [registerControls, pauseForInteraction, resumeFromPosition, stop, isPlaying, isLoading, generateSpeech, mode, selectedText, chapterText, primeAudioFromGesture]);

  if (!hasAccess) return null;

  const hasSelection = selectedText && selectedText.trim().length > 10;

  return (
    <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 shadow-lg">
      {/* CONTRACT 5.3: Mandatory audio state indicator */}
      {audioReliability.isLoading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">{audioReliability.stateMessage}</span>
        </div>
      )}
      
      {/* CONTRACT 5: Show "Resuming" indicator after interruption */}
      {audioReliability.wasInterrupted && !isPlaying && !isLoading && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            audioReliability.clearInterruption();
            primeAudioFromGesture();
            resumeFromPosition();
          }}
          className="h-8 gap-1.5 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
          title="Resume where you left off"
        >
          <RotateCcw className="h-3 w-3" />
          Resume
        </Button>
      )}

      {/* Play Chapter */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          // CONTRACT 5.6: Immediate visual acknowledgment
          const complete = audioReliability.acknowledgeUserAction('play-chapter');
          handlePlayChapter();
          complete();
        }}
        disabled={isLoading && mode !== "chapter"}
        className={cn("h-8 gap-1.5", isPlaying && mode === "chapter" && "text-primary")}
        title={isPlaying && mode === "chapter" ? "Stop" : "Read Chapter"}
      >
        {isLoading && mode === "chapter" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying && mode === "chapter" ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        <span className="hidden sm:inline text-xs">Chapter</span>
      </Button>

      {/* Play Selection - only show if text is selected */}
      {hasSelection && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const complete = audioReliability.acknowledgeUserAction('play-selection');
            handlePlaySelection();
            complete();
          }}
          disabled={isLoading && mode !== "selection"}
          className="h-8 gap-1.5 text-xs"
          title="Read Selection"
        >
          {isLoading && mode === "selection" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Volume2 className="h-3 w-3" />
          )}
          Selection
        </Button>
      )}

      {/* Stop Button */}
      {(isPlaying || isLoading) && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const complete = audioReliability.acknowledgeUserAction('stop');
            stop();
            complete();
          }}
          className="h-8 w-8"
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </Button>
      )}
      
      {/* Interactive Guard Mode - Voice AI Button (Rule 5.4) */}
      {onInterrupt && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const complete = audioReliability.acknowledgeUserAction('interrupt');
            if (isPlaying) {
              pauseForInteraction();
            }
            onInterrupt();
            complete();
          }}
          className="h-8 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10"
          title="Open Voice AI"
        >
          <Mic className="h-3 w-3" />
          Voice AI
        </Button>
      )}

      {/* CONTRACT 5.3: Progress indicator with buffering state */}
      {(isPlaying || audioReliability.isLoading) && totalChunks > 1 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {currentChunk}/{totalChunks}
          </span>
          {audioReliability.state === 'buffering' && (
            <span className="text-xs text-amber-500">buffering</span>
          )}
        </div>
      )}
      
      {/* AUTO-CONTINUE indicator */}
      {autoContinue && currentChapter && totalChapters && currentChapter < totalChapters && (
        <div className="flex items-center gap-1 text-xs text-primary" title="Auto-continue enabled">
          <SkipForward className="h-3 w-3" />
          <span className="hidden sm:inline">→Ch {currentChapter + 1}</span>
        </div>
      )}

      {/* CONTRACT 5.3: Error indicator with retry option */}
      {error && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            audioReliability.setState('idle');
          }}
          className="h-8 gap-1 text-destructive hover:text-destructive"
          title={`Error: ${error}. Tap to retry`}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">Retry</span>
        </Button>
      )}

      {/* Volume/Voice/Speed Settings */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end" side="top">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Volume</label>
              <div className="flex items-center gap-2">
                {volume === 0 ? (
                  <VolumeX className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Volume2 className="h-3 w-3 text-muted-foreground" />
                )}
                <Slider
                  value={[volume * 100]}
                  onValueChange={([v]) => setVolume(v / 100)}
                  max={100}
                  step={10}
                  className="flex-1"
                />
              </div>
            </div>
            
            {/* Playback Speed */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Speed: {playbackSpeed}x</label>
              <div className="flex gap-1">
                {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      setPlaybackSpeed(speed);
                      playbackSpeedRef.current = speed;
                      onPlaybackSpeedChange?.(speed);
                      if (audioRef.current) {
                        audioRef.current.playbackRate = speed;
                      }
                    }}
                    className={`flex-1 px-1.5 py-1 text-xs rounded transition-all ${
                      playbackSpeed === speed
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Voice</label>
              <Select
                value={selectedVoice}
                onValueChange={(newVoice) => {
                  // Stop current playback and cleanup before switching
                  const wasPlaying = isPlaying;
                  stop();
                  cleanupBlobUrls();
                  setSelectedVoice(newVoice);
                  setProgress(0);
                  setCurrentChunk(0);
                  setCurrentPosition(0);
                  pausedAtChunkRef.current = 0;

                  // Regenerate TTS with new voice after state update
                  if (wasPlaying) {
                    setTimeout(() => {
                      generateSpeech(
                        mode === 'selection' && selectedText ? selectedText : chapterText,
                        mode === 'selection'
                      );
                    }, 100);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id} className="text-xs">
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Close button */}
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" title="Close">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
});
