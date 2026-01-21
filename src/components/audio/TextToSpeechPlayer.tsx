import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Volume2, VolumeX, Play, Pause, Settings, Loader2, Square, AlertCircle, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";

interface TextToSpeechPlayerProps {
  text: string;
  language?: string;
  onPlayingChange?: (playing: boolean) => void;
  /** Change this value to force-stop playback (e.g. when changing pages). */
  stopKey?: string | number;
}

// OpenAI TTS voices
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy (Neutral)" },
  { id: "echo", name: "Echo (Male)" },
  { id: "fable", name: "Fable (British)" },
  { id: "onyx", name: "Onyx (Deep Male)" },
  { id: "nova", name: "Nova (Female)" },
  { id: "shimmer", name: "Shimmer (Soft Female)" },
];

export function TextToSpeechPlayer({ text, language = "en", onPlayingChange, stopKey }: TextToSpeechPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Use centralized entitlements - SINGLE SOURCE OF TRUTH
  const entitlements = useEntitlements();
  
  // FAIL-OPEN: Admin, Prophet, Premium, Student, or any paid user has TTS access
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent || entitlements.isPaid;
  const canUseTTS = hasFullAccess || entitlements.canUseTTS;

  const stopRef = useRef(false);
  const isStoppingRef = useRef(false);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const prevStopKeyRef = useRef<string | number | undefined>(undefined);
  const isMountedRef = useRef(true);
  const wasPlayingBeforeInterruptRef = useRef(false);
  const currentChunkIndexRef = useRef(0);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle visibility changes (tab switch, phone call, etc.)
  // Simplified: just track state, don't try to auto-resume which causes issues on mobile
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - track if we were playing
        if (isPlaying && !isLoading) {
          wasPlayingBeforeInterruptRef.current = true;
          console.log("[TTS] Page hidden while playing");
        }
      } else {
        // Page is visible again - reset interrupt flag
        // User can manually resume if needed
        if (wasPlayingBeforeInterruptRef.current) {
          console.log("[TTS] Page visible again - user can tap play to continue");
          wasPlayingBeforeInterruptRef.current = false;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPlaying, isLoading]);

  const base64ToBlobUrl = useCallback((base64: string, mimeType = "audio/mpeg") => {
    try {
      // Use data URI for maximum browser compatibility - avoids atob() corruption issues
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.error("[TTS] Failed to create audio URL:", err);
      throw new Error("Failed to process audio data");
    }
  }, []);

  const sanitizeTextForTTS = useCallback((raw: string) => {
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

  const chunkText = useCallback((input: string, maxChars = 800) => {
    const text = input.trim();
    if (!text) return [] as string[];

    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

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
    // Data URIs don't need revocation, but clear the array anyway
    activeBlobUrlsRef.current = [];
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
      
      // Set audio attributes for better mobile behavior
      audio.preload = 'auto';
      
      // Track if we've already resolved to prevent double-resolve
      let resolved = false;
      const safeResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      const cleanup = () => {
        audio.onplay = null;
        audio.onended = null;
        audio.onpause = null;
        audio.onerror = null;
        audio.ontimeupdate = null;
        audio.onstalled = null;
        audio.onwaiting = null;
        audio.oncanplaythrough = null;
      };

      audio.onplay = () => {
        if (isMountedRef.current) {
          setIsPlaying(true);
          setError(null);
          onPlayingChange?.(true);
        }
      };

      audio.onended = () => {
        cleanup();
        safeResolve(true);
      };

      audio.onpause = () => {
        // Only handle as stop if we explicitly requested stop
        if (stopRef.current || isStoppingRef.current) {
          cleanup();
          safeResolve(false);
        }
        // Otherwise this is an external pause (visibility change, etc.)
        // Don't auto-resume as it can cause loops on mobile
      };

      audio.onerror = (e) => {
        console.error("[TTS] Audio playback error:", e);
        cleanup();
        safeResolve(false);
      };
      
      audio.onstalled = () => {
        console.log("[TTS] Audio stalled - waiting for data");
      };
      
      audio.onwaiting = () => {
        console.log("[TTS] Audio waiting for data");
      };

      audio.ontimeupdate = () => {
        if (audio.duration && isMountedRef.current && !resolved) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      // Better error handling for mobile - use canplaythrough
      audio.oncanplaythrough = () => {
        console.log("[TTS] Audio ready to play");
      };

      audio.src = url;
      
      // Use a play promise with proper error handling
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("[TTS] Playback started successfully");
          })
          .catch((err) => {
            cleanup();
            if (err?.name !== "AbortError") {
              console.error("[TTS] Play error:", err);
              if (isMountedRef.current) {
                setError("Tap to retry audio");
              }
            }
            safeResolve(false);
          });
      }
    });
  }, [onPlayingChange, volume]);

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

    if (isMountedRef.current) {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setError(null);
      onPlayingChange?.(false);
    }

    setTimeout(() => {
      isStoppingRef.current = false;
    }, 50);
  }, [cleanupBlobUrls, onPlayingChange]);

  const generateSpeech = useCallback(async () => {
    // Stop any existing playback
    stop();
    await new Promise(resolve => setTimeout(resolve, 100));

    const cleaned = sanitizeTextForTTS(text || "");

    if (!cleaned) {
      toast({
        title: "No text",
        description: "No readable text found",
        variant: "destructive",
      });
      return;
    }

    // Reset state for new playback
    stopRef.current = false;
    isStoppingRef.current = false;

    setError(null);
    setIsLoading(true);
    setProgress(0);

    cleanupBlobUrls();

    let chunks = chunkText(cleaned, 800);

    // Faster "time to first audio": make the first chunk smaller.
    if (chunks[0] && chunks[0].length > 260) {
      const first = chunks[0].slice(0, 260);
      const rest = chunks[0].slice(260).trim();
      chunks = [first, ...(rest ? [rest] : []), ...chunks.slice(1)];
    }

    console.log("[TTS Client] Chunked playback:", { chunks: chunks.length });

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current || isStoppingRef.current) break;

        const chunk = chunks[i];
        currentChunkIndexRef.current = i;
        console.log("[TTS Client] Generating chunk", i + 1, "/", chunks.length, { len: chunk.length });

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: {
            text: chunk,
            voice: selectedVoice,
            language,
          },
        });

        if (stopRef.current || isStoppingRef.current) break;

        if (invokeError) throw new Error(invokeError.message || "Failed to invoke TTS function");
        if (data?.error) throw new Error(data.error);
        if (!data?.audioContent) throw new Error("No audio content received from server");

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);

        // First audio should start ASAP
        if (i === 0 && isMountedRef.current) setIsLoading(false);

        const success = await playUrl(url);
        if (!success) {
          console.log("[TTS Client] Chunk playback failed, stopping sequence");
          break;
        }
        
        // Small delay between chunks to prevent audio resource conflicts
        if (i < chunks.length - 1 && !stopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("[TTS Client] Playback stopped by user");
      } else {
        console.error("[TTS Client] Error:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to generate speech";
        if (isMountedRef.current) {
          setError(errorMessage);
          toast({
            title: "TTS Failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsPlaying(false);
        setProgress(0);
        onPlayingChange?.(false);
      }
      cleanupBlobUrls();
    }
  }, [
    base64ToBlobUrl,
    chunkText,
    cleanupBlobUrls,
    language,
    onPlayingChange,
    playUrl,
    sanitizeTextForTTS,
    selectedVoice,
    text,
    toast,
    stop,
  ]);

  // Stop audio when changing pages
  useEffect(() => {
    if (stopKey === undefined) return;

    if (prevStopKeyRef.current === undefined) {
      prevStopKeyRef.current = stopKey;
      return;
    }

    if (prevStopKeyRef.current !== stopKey) {
      prevStopKeyRef.current = stopKey;
      stop();
    }
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

  const togglePlayPause = useCallback(() => {
    if (isLoading) return;

    if (isPlaying) {
      stop();
      return;
    }

    generateSpeech();
  }, [generateSpeech, isLoading, isPlaying, stop]);

  // Render a disabled control when the user doesn't have TTS access (never render nothing)
  if (!canUseTTS && !entitlements.isPaid && !entitlements.isAdmin) {
    return (
      <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 border border-border/50 opacity-75">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled title="Upgrade to enable audio">
          <Lock className="h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground">Audio playback is unavailable on your plan.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 border border-border/50">
      {/* Play/Pause Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        className="h-8 w-8"
        disabled={isLoading}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Stop Button */}
      {(isPlaying || progress > 0) && (
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

      {/* Error indicator */}
      {error && (
        <div className="flex items-center gap-1 text-destructive" title={error}>
          <AlertCircle className="h-4 w-4" />
        </div>
      )}

      {/* Progress */}
      {(isPlaying || progress > 0) && !error && (
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-24">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Settings Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Volume</label>
              <div className="flex items-center gap-2">
                {volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Powered by OpenAI TTS
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
