import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Volume2, VolumeX, Play, Pause, Settings, Loader2, Square, AlertCircle, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UsageGateModal, useUsageGate } from "@/components/subscription/UsageGateModal";
import { parseGateError } from "@/lib/usageGate";
import { useSubscription } from "@/contexts/SubscriptionContext";

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
  const usageGate = useUsageGate();
  const { tier } = useSubscription();

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
  // Cumulative seconds across previously-completed chunks (for stable elapsed display)
  const cumulativeSecondsRef = useRef(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // PERSISTENT audio element — created ONCE and reused across renders / chunks.
  // Recreating Audio on every render causes:
  //   - Resets to 0:00 on every UI update
  //   - Loss of iOS user-gesture unlock (audio stops playing)
  //   - Re-buffer flicker between chunks
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audio.setAttribute("playsinline", "true");
      audio.setAttribute("webkit-playsinline", "true");
      audioRef.current = audio;
    }
    return () => {
      // App-level cleanup only on full unmount
      const a = audioRef.current;
      if (a) {
        try {
          a.pause();
          a.removeAttribute("src");
          a.src = "";
        } catch { /* noop */ }
      }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return URL.createObjectURL(new Blob(byteArrays, { type: mimeType }));
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
    activeBlobUrlsRef.current.forEach((url) => {
      if (url.startsWith("blob:")) {
        try { URL.revokeObjectURL(url); } catch { /* noop */ }
      }
    });
    activeBlobUrlsRef.current = [];
  }, []);

  const playUrl = useCallback((url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (stopRef.current || isStoppingRef.current) {
        resolve(false);
        return;
      }

      // Reuse the persistent audio element — DO NOT recreate per chunk
      const audio = audioRef.current;
      if (!audio) {
        resolve(false);
        return;
      }

      audio.volume = volume;

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
        audio.onloadedmetadata = null;
      };

      audio.onplay = () => {
        if (isMountedRef.current) {
          setIsPlaying(true);
          setError(null);
          onPlayingChange?.(true);
        }
      };

      audio.onended = () => {
        // Accumulate this chunk's duration for stable elapsed time
        if (audio.duration && !isNaN(audio.duration)) {
          cumulativeSecondsRef.current += audio.duration;
          if (isMountedRef.current) {
            setElapsedSeconds(cumulativeSecondsRef.current);
          }
        }
        cleanup();
        safeResolve(true);
      };

      audio.onpause = () => {
        if (stopRef.current || isStoppingRef.current) {
          cleanup();
          safeResolve(false);
        }
        // Otherwise: external pause (visibility, system) — keep audio alive
      };

      audio.onerror = (e) => {
        console.error("[TTS] Audio playback error:", e);
        cleanup();
        safeResolve(false);
      };

      audio.onstalled = () => console.log("[TTS] Audio stalled");
      audio.onwaiting = () => console.log("[TTS] Audio waiting");

      audio.ontimeupdate = () => {
        if (audio.duration && isMountedRef.current && !resolved) {
          setProgress((audio.currentTime / audio.duration) * 100);
          // Live elapsed = previously-completed chunks + current chunk position
          setElapsedSeconds(cumulativeSecondsRef.current + audio.currentTime);
        }
      };

      audio.oncanplaythrough = () => {
        console.log("[TTS] Audio ready to play");
      };

      // Only the src changes — element stays alive (preserves iOS unlock)
      try {
        audio.src = url;
      } catch (err) {
        console.error("[TTS] Failed to set src", err);
        cleanup();
        safeResolve(false);
        return;
      }

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("[TTS] Playback started");
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

  // Full stop: pauses and clears src on the persistent element (does NOT destroy it)
  const stop = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    stopRef.current = true;

    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.src = "";
        audio.currentTime = 0;
      } catch { /* ignore */ }
    }

    // Cancel any in-flight browser SpeechSynthesis fallback
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch { /* ignore */ }

    cleanupBlobUrls();
    cumulativeSecondsRef.current = 0;

    if (isMountedRef.current) {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setElapsedSeconds(0);
      setError(null);
      onPlayingChange?.(false);
    }

    setTimeout(() => {
      isStoppingRef.current = false;
    }, 50);
  }, [cleanupBlobUrls, onPlayingChange]);

  // True pause: keeps audio element alive, preserves position
  const pause = useCallback(() => {
    if (!audioRef.current) return;
    try {
      audioRef.current.pause();
    } catch { /* ignore */ }
    stopRef.current = true; // Stop the chunk loop from advancing
    if (isMountedRef.current) {
      setIsPlaying(false);
      onPlayingChange?.(false);
    }
  }, [onPlayingChange]);

  // Resume: tries to resume the current audio element
  const resume = useCallback(() => {
    if (!audioRef.current) return;
    stopRef.current = false;
    audioRef.current.play().then(() => {
      if (isMountedRef.current) {
        setIsPlaying(true);
        onPlayingChange?.(true);
      }
    }).catch(() => {
      // If resume fails, user can tap play again to regenerate
      stopRef.current = true;
    });
  }, [onPlayingChange]);

  // Browser SpeechSynthesis fallback (used when premium provider is unavailable / out of quota)
  const speakWithBrowser = useCallback(
    (chunk: string, lang: string, isCancelled: () => boolean): Promise<boolean> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve(false);
          return;
        }
        try {
          const synth = window.speechSynthesis;
          synth.cancel();
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = lang || "en-US";
          utterance.volume = volume;
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.onend = () => resolve(true);
          utterance.onerror = () => resolve(false);
          if (isMountedRef.current) {
            setIsPlaying(true);
            onPlayingChange?.(true);
          }
          synth.speak(utterance);
          // Poll for cancellation
          const interval = setInterval(() => {
            if (isCancelled()) {
              try { synth.cancel(); } catch { /* ignore */ }
              clearInterval(interval);
              resolve(true);
            }
            if (!synth.speaking) {
              clearInterval(interval);
            }
          }, 200);
        } catch (e) {
          console.error("[TTS Client] Browser speech synthesis error", e);
          resolve(false);
        }
      });
    },
    [onPlayingChange, volume],
  );

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
    cumulativeSecondsRef.current = 0;

    setError(null);
    setIsLoading(true);
    setProgress(0);
    setElapsedSeconds(0);

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

        // Provider quota exhausted / down → fall back to browser SpeechSynthesis
        if (data?.fallback === true) {
          console.warn("[TTS Client] Provider unavailable, using browser SpeechSynthesis fallback", data?.reason);
          if (i === 0 && isMountedRef.current) {
            setIsLoading(false);
            toast({
              title: "Using device voice",
              description: "Premium voice is temporarily unavailable. Playing with your device's built-in voice.",
            });
          }
          const ok = await speakWithBrowser(chunk, language, () => stopRef.current || isStoppingRef.current);
          if (!ok) {
            throw new Error("Your device does not support speech synthesis.");
          }
          if (i < chunks.length - 1 && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 50));
          }
          continue;
        }

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

        // First, try to surface this as a usage gate (audio limit, plan, AI quota)
        const errLike = err as unknown;
        const ctx = (errLike && typeof errLike === "object" && "context" in (errLike as Record<string, unknown>))
          ? (errLike as { context?: unknown }).context
          : errLike;
        const gate = parseGateError(ctx ?? errLike, tier);
        if (!gate.allowed && gate.upgradeRequired) {
          if (isMountedRef.current) {
            setError("Audio unavailable on your plan");
            usageGate.trigger(gate);
          }
        } else if (isMountedRef.current) {
          setError(errorMessage);
          toast({
            title: "Audio unavailable",
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
    speakWithBrowser,
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
      // True pause - don't destroy audio
      pause();
      return;
    }

    // If audio element exists and has a src, try to resume
    if (audioRef.current && audioRef.current.src && audioRef.current.src !== '') {
      resume();
      return;
    }

    // Otherwise generate fresh
    generateSpeech();
  }, [generateSpeech, isLoading, isPlaying, pause, resume]);

  // Render a disabled control when the user doesn't have TTS access (never render nothing)
  if (!canUseTTS && !entitlements.isPaid && !entitlements.isAdmin) {
    return (
      <>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 border border-border/50 opacity-75">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled title="Upgrade to enable audio">
            <Lock className="h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">Audio playback is unavailable on your plan.</p>
        </div>
        <UsageGateModal
          open={usageGate.open}
          onOpenChange={(o) => { if (!o) usageGate.close(); }}
          result={usageGate.result}
          source="reader-tts"
        />
      </>
    );
  }

  return (
    <>
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
    <UsageGateModal
      open={usageGate.open}
      onOpenChange={(o) => { if (!o) usageGate.close(); }}
      result={usageGate.result}
      source="reader-tts"
    />
    </>
  );
}
