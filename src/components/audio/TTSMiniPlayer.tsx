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
}

export const TTSMiniPlayer = forwardRef<HTMLDivElement, TTSMiniPlayerProps>(function TTSMiniPlayer({ 
  chapterText, 
  selectedText, 
  language = "en", 
  onClose,
  stopKey,
  title = "Chapter",
  author = "ScrollLibrary",
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
}, ref) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const playbackSpeedRef = useRef(1.0);
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
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
    // Data URIs don't need revocation, but clear the array
    activeBlobUrlsRef.current = [];
  }, []);

  const base64ToBlobUrl = useCallback((base64: string, mimeType = "audio/mpeg") => {
    // Use data URI for maximum browser compatibility — avoids atob() binary corruption
    return `data:${mimeType};base64,${base64}`;
  }, []);

  // Unlock audio context on user gesture - call this synchronously in click handler
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    
    // Create a persistent audio element on first user interaction
    if (!audioRef.current) {
      const audio = new Audio();
      audio.volume = volume;
      audioRef.current = audio;
    }
    
    // Play silent audio to unlock autoplay
    const audio = audioRef.current;
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().then(() => {
      audio.pause();
      audioUnlockedRef.current = true;
      console.log("[TTS] Audio context unlocked");
    }).catch(() => {
      // Still mark as attempted
      audioUnlockedRef.current = true;
    });
  }, [volume]);

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

      // Reuse existing audio element if available, or create new
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.volume = volume;
      audio.playbackRate = playbackSpeedRef.current;
      
      // Expose audioRef for external sync (sentence highlighting)
      onAudioRefChange?.(audio);

      const cleanup = () => {
        audio.onplay = null;
        audio.onended = null;
        audio.onpause = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
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

      audio.onplay = () => {
        // Always apply latest speed when play starts
        audio.playbackRate = playbackSpeedRef.current;
        if (isMountedRef.current) setIsPlaying(true);
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
        cleanup();
        safeResolve(false);
      };
      
      audio.ontimeupdate = () => {
        if (audio.duration && isMountedRef.current) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.src = url;
      audio.play().catch((err) => {
        cleanup();
        if (err?.name === "NotAllowedError") {
          console.error("[TTS] Play blocked by autoplay policy — requires user gesture");
          autoplayBlockedRef.current = true;
        } else if (err?.name !== "AbortError") {
          console.error("[TTS] Play error:", err);
        }
        safeResolve(false);
      });
    });
  }, [volume, onPlayingChange, onAudioRefChange]);

  // Full stop: destroys playback entirely, resets all state
  const stop = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    stopRef.current = true;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch { /* ignore */ }
    }

    cleanupBlobUrls();
    mediaSession.setPlaybackState('idle');
    mediaSession.deactivate();
    
    // Reset paused position so next play starts fresh
    pausedAtChunkRef.current = 0;
    
    if (isMountedRef.current) {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setCurrentChunk(0);
      setCurrentPosition(0);
      setError(null);
    }
    
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 50);
  }, [cleanupBlobUrls, mediaSession]);
  
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
    
    if (isMountedRef.current) {
      setIsPlaying(false);
    }
    
    console.log('[TTS] Paused for interaction at chunk', currentChunk);
  }, [isPlaying, currentChunk, mediaSession]);
  
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
    stopRef.current = false;
    isStoppingRef.current = false;
    setIsLoading(true);
    
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

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: { text: chunks[i], voice: selectedVoice, language },
        });

        if (stopRef.current) break;
        if (invokeError) throw new Error(invokeError.message || "TTS failed");
        if (data?.error) throw new Error(data.error);
        if (!data?.audioContent) throw new Error("No audio received");

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);

        if (i === 0 && isMountedRef.current) setIsLoading(false);

        const success = await playUrl(url);
        if (!success) break;
      }
    } catch (err) {
      console.error("[TTS] Resume error:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "TTS failed");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
      }
      mediaSession.setPlaybackState('idle');
    }
  }, [selectedVoice, language, base64ToBlobUrl, playUrl, mediaSession]);

  const generateSpeech = useCallback(async (textToRead: string, isSelection = false) => {
    // CRITICAL: Unlock audio context immediately on user gesture (before any async work)
    unlockAudio();
    
    // CONTRACT 5.6: Immediate visual feedback - show loading BEFORE stopping
    setIsLoading(true);
    setError(null);
    setMode(isSelection ? "selection" : "chapter");
    audioReliability.setState('loading');
    
    // Stop any existing playback first — but use direct cleanup instead of stop()
    // to avoid the stopRef race condition
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch { /* ignore */ }
      // Keep audioRef alive to preserve browser autoplay permission
    }
    cleanupBlobUrls();
    
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
    
    // Small delay for audio element cleanup
    await new Promise(resolve => setTimeout(resolve, 80));
    
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

    // Prefetch helper with retry logic for network failures
    const fetchChunkAudio = async (chunk: string, retries = 2): Promise<string | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (stopRef.current) return null;
        
        try {
          const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
            body: { text: chunk, voice: selectedVoice, language },
          });
          
          if (stopRef.current) return null;
          
          if (invokeError) {
            console.error(`[TTS] Chunk fetch error (attempt ${attempt + 1}):`, invokeError);
            if (attempt < retries) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            return null;
          }
          
          if (data?.error) {
            console.error(`[TTS] API error:`, data.error);
            // Don't retry for API errors (e.g., quota exceeded)
            return null;
          }
          
          if (!data?.audioContent) {
            console.error("[TTS] No audio content received");
            if (attempt < retries) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            return null;
          }
          
          const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
          activeBlobUrlsRef.current.push(url);
          return url;
        } catch (err) {
          console.error(`[TTS] Network error (attempt ${attempt + 1}):`, err);
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          return null;
        }
      }
      return null;
    };

    try {
      // Start prefetching first chunk immediately
      let nextChunkPromise: Promise<string | null> | null = fetchChunkAudio(chunks[0]);
      
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
            nextChunkPromise = fetchChunkAudio(chunks[i + 1]);
            continue;
          }
          break;
        }

        // Start prefetching NEXT chunk while current plays (gapless playback)
        if (i + 1 < chunks.length) {
          nextChunkPromise = fetchChunkAudio(chunks[i + 1]);
        } else {
          nextChunkPromise = null;
        }

        if (i === 0 && isMountedRef.current) {
          setIsLoading(false);
          mediaSession.setPlaybackState('playing');
        }

        const success = await playUrl(currentUrl);
        
        if (!success) {
          console.log("[TTS] Playback of chunk", i + 1, "was interrupted");
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
    }
  }, [sanitizeText, chunkText, cleanupBlobUrls, base64ToBlobUrl, playUrl, selectedVoice, language, toast, mediaSession, unlockAudio, autoContinue, onChapterComplete, audioReliability]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRef.current = true;
      isStoppingRef.current = true;
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = "";
        } catch { /* ignore */ }
      }
      cleanupBlobUrls();
    };
  }, [cleanupBlobUrls]);

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
    // If we have a saved position, resume from there instead of restarting
    if (pausedAtChunkRef.current > 0 && chunksRef.current.length > 0) {
      resumeFromPosition();
      return;
    }
    generateSpeech(chapterText, false);
  };

  const handlePlaySelection = () => {
    if (!selectedText || isLoading) return;
    if (isPlaying && mode === "selection") {
      stop();
    } else {
      generateSpeech(selectedText, true);
    }
  };

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
