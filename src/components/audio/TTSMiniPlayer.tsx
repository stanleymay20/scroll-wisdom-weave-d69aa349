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

import { useState, useRef, useCallback, useEffect } from "react";
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
  RotateCcw 
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
  /** Callback when user wants to ask a question (Interactive Guard Mode) */
  onInterrupt?: () => void;
}

export function TTSMiniPlayer({ 
  chapterText, 
  selectedText, 
  language = "en", 
  onClose,
  stopKey,
  title = "Chapter",
  author = "ScrollLibrary",
  onInterrupt 
}: TTSMiniPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [progress, setProgress] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [mode, setMode] = useState<"chapter" | "selection">("chapter");
  // Track current position for resume (Interactive Guard Mode - Rule 5.4)
  const [currentPosition, setCurrentPosition] = useState(0);
  const pausedAtChunkRef = useRef(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const isStoppingRef = useRef(false);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const prevStopKeyRef = useRef<string | number | undefined>(undefined);
  const isMountedRef = useRef(true);
  const chunksRef = useRef<string[]>([]);
  // Track if audio context is unlocked (user has interacted)
  const audioUnlockedRef = useRef(false);
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

  // CONTRACT 5 - Rule 5.3: Smaller chunks for faster first audio (≤400 chars initial)
  const chunkText = useCallback((input: string, maxChars = 600) => {
    const text = input.trim();
    if (!text) return [];

    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const s of sentences) {
      if (!current) {
        current = s;
        continue;
      }
      if ((current + " " + s).length <= maxChars) {
        current = current + " " + s;
      } else {
        chunks.push(current);
        current = s;
      }
    }
    if (current) chunks.push(current);
    if (chunks.length === 0) return [text.slice(0, maxChars)];
    return chunks;
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    for (const url of activeBlobUrlsRef.current) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    activeBlobUrlsRef.current = [];
  }, []);

  const base64ToBlobUrl = useCallback((base64: string, mimeType = "audio/mpeg") => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
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
      if (stopRef.current || isStoppingRef.current) {
        resolve(false);
        return;
      }

      // Reuse existing audio element if available, or create new
      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.volume = volume;

      const cleanup = () => {
        audio.onplay = null;
        audio.onended = null;
        audio.onpause = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
      };

      audio.onplay = () => {
        if (isMountedRef.current) setIsPlaying(true);
      };
      
      audio.onended = () => {
        cleanup();
        resolve(true);
      };
      
      audio.onpause = () => {
        if (stopRef.current || isStoppingRef.current) {
          cleanup();
          resolve(false);
        }
      };
      
      audio.onerror = () => {
        cleanup();
        resolve(false);
      };
      
      audio.ontimeupdate = () => {
        if (audio.duration && isMountedRef.current) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.src = url;
      audio.play().catch((err) => {
        cleanup();
        // AbortError is expected when stopping
        if (err?.name !== "AbortError") {
          console.error("[TTS] Play error:", err);
        }
        resolve(false);
      });
    });
  }, [volume]);

  const stop = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    stopRef.current = true;

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch { /* ignore */ }
      audioRef.current = null;
    }

    cleanupBlobUrls();
    mediaSession.setPlaybackState('idle');
    mediaSession.deactivate();
    
    if (isMountedRef.current) {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setCurrentChunk(0);
      setCurrentPosition(0);
      setError(null);
    }
    
    // Reset stopping flag after a short delay to allow any pending callbacks
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
    if (chunksRef.current.length === 0 || pausedAtChunkRef.current === 0) {
      // No previous position, start fresh
      return;
    }
    
    console.log('[TTS] Resuming from chunk', pausedAtChunkRef.current);
    
    // Resume playback from the saved chunk position
    const remainingChunks = chunksRef.current.slice(pausedAtChunkRef.current);
    if (remainingChunks.length > 0) {
      generateSpeechFromChunks(remainingChunks, pausedAtChunkRef.current);
    }
  }, []);

  // Helper to generate speech from a list of chunks (for resume)
  const generateSpeechFromChunks = useCallback(async (chunks: string[], startIndex: number) => {
    stopRef.current = false;
    isStoppingRef.current = false;
    setIsLoading(true);
    
    mediaSession.activate();
    mediaSession.setPlaybackState('playing');

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current || isStoppingRef.current) break;

        const globalIndex = startIndex + i;
        setCurrentChunk(globalIndex + 1);
        setCurrentPosition(globalIndex);

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: { text: chunks[i], voice: selectedVoice, language },
        });

        if (stopRef.current || isStoppingRef.current) break;
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
    
    // Stop any existing playback first
    stop();
    
    // Wait for stop to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const cleaned = sanitizeText(textToRead);
    if (!cleaned) {
      toast({ title: "No text", description: "No readable text found", variant: "destructive" });
      return;
    }

    // Reset state for new playback
    stopRef.current = false;
    isStoppingRef.current = false;
    pausedAtChunkRef.current = 0;
    
    setError(null);
    setIsLoading(true);
    setProgress(0);
    setMode(isSelection ? "selection" : "chapter");

    cleanupBlobUrls();

    // CONTRACT 5 - Rule 5.3: For selection, use a single small chunk
    // For chapter, use smaller first chunk (≤200 chars) for instant audio start
    let chunks = isSelection 
      ? [cleaned.slice(0, 1200)] 
      : chunkText(cleaned, 600);

    // Make first chunk even smaller for faster start (≤200 chars)
    if (!isSelection && chunks[0] && chunks[0].length > 200) {
      const first = chunks[0].slice(0, 200);
      const rest = chunks[0].slice(200).trim();
      chunks = [first, ...(rest ? [rest] : []), ...chunks.slice(1)];
    }

    // Store chunks for potential resume (Rule 5.4)
    chunksRef.current = chunks;
    setTotalChunks(chunks.length);
    console.log("[TTS] Starting playback with", chunks.length, "chunks (first:", chunks[0]?.length, "chars)");

    // Activate media session for OS controls (Rule 5.3)
    mediaSession.activate();
    mediaSession.setPlaybackState('playing');

    // Prefetch helper - generates audio for a chunk
    const fetchChunkAudio = async (chunk: string): Promise<string | null> => {
      if (stopRef.current || isStoppingRef.current) return null;
      
      const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
        body: { text: chunk, voice: selectedVoice, language },
      });
      
      if (stopRef.current || isStoppingRef.current) return null;
      if (invokeError || data?.error || !data?.audioContent) {
        console.error("[TTS] Chunk fetch error:", invokeError || data?.error);
        return null;
      }
      
      const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
      activeBlobUrlsRef.current.push(url);
      return url;
    };

    try {
      // Start prefetching first chunk immediately
      let nextChunkPromise: Promise<string | null> | null = fetchChunkAudio(chunks[0]);
      
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current || isStoppingRef.current) {
          console.log("[TTS] Playback stopped at chunk", i);
          break;
        }

        setCurrentChunk(i + 1);
        setCurrentPosition(i);

        console.log("[TTS] Playing chunk", i + 1, "/", chunks.length);

        // Wait for current chunk audio (already being fetched)
        const currentUrl = await nextChunkPromise;
        
        if (!currentUrl) {
          console.log("[TTS] Failed to fetch chunk", i + 1);
          throw new Error("Failed to generate audio");
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
      }
      mediaSession.setPlaybackState('idle');
      cleanupBlobUrls();
    }
  }, [sanitizeText, chunkText, cleanupBlobUrls, base64ToBlobUrl, playUrl, selectedVoice, language, toast, stop, mediaSession, unlockAudio]);

  // Stop on stopKey change (page navigation)
  useEffect(() => {
    if (stopKey === undefined) return;
    if (prevStopKeyRef.current !== undefined && prevStopKeyRef.current !== stopKey) {
      console.log("[TTS] Stop key changed, stopping playback");
      stop();
    }
    prevStopKeyRef.current = stopKey;
  }, [stopKey, stop]);

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
      stop();
    } else {
      generateSpeech(chapterText, false);
    }
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
      
      {/* Interactive Guard Mode - Ask Question Button (Rule 5.4) */}
      {isPlaying && onInterrupt && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const complete = audioReliability.acknowledgeUserAction('interrupt');
            pauseForInteraction();
            onInterrupt();
            complete();
          }}
          className="h-8 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10"
          title="Ask a question"
        >
          <Mic className="h-3 w-3" />
          Ask
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

      {/* Volume/Voice Settings */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end" side="top">
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
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
}
