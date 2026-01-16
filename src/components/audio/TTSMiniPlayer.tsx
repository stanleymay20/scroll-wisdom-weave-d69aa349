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
  Mic 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useMediaSession } from "@/hooks/useMediaSession";
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

  const { toast } = useToast();
  const entitlements = useEntitlements();
  
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

  const playUrl = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (stopRef.current || isStoppingRef.current) {
        resolve(false);
        return;
      }

      const audio = new Audio();
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

    try {
      for (let i = 0; i < chunks.length; i++) {
        // Check stop flag before each chunk
        if (stopRef.current || isStoppingRef.current) {
          console.log("[TTS] Playback stopped at chunk", i);
          break;
        }

        setCurrentChunk(i + 1);
        setCurrentPosition(i);
        const chunk = chunks[i];

        console.log("[TTS] Generating chunk", i + 1, "/", chunks.length, `(${chunk.length} chars)`);

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: { text: chunk, voice: selectedVoice, language },
        });

        // Check stop flag after API call
        if (stopRef.current || isStoppingRef.current) {
          console.log("[TTS] Playback stopped after API call");
          break;
        }
        
        if (invokeError) throw new Error(invokeError.message || "TTS failed");
        if (data?.error) throw new Error(data.error);
        if (!data?.audioContent) throw new Error("No audio received");

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);

        if (i === 0 && isMountedRef.current) {
          setIsLoading(false);
          mediaSession.setPlaybackState('playing');
        }

        const success = await playUrl(url);
        
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
  }, [sanitizeText, chunkText, cleanupBlobUrls, base64ToBlobUrl, playUrl, selectedVoice, language, toast, stop, mediaSession]);

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
      {/* Play Chapter */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePlayChapter}
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
          onClick={handlePlaySelection}
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
          onClick={stop}
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
            pauseForInteraction();
            onInterrupt();
          }}
          className="h-8 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10"
          title="Ask a question"
        >
          <Mic className="h-3 w-3" />
          Ask
        </Button>
      )}

      {/* Progress indicator */}
      {isPlaying && totalChunks > 1 && (
        <span className="text-xs text-muted-foreground">
          {currentChunk}/{totalChunks}
        </span>
      )}

      {/* Error indicator */}
      {error && (
        <div className="text-destructive" title={error}>
          <AlertCircle className="h-4 w-4" />
        </div>
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
