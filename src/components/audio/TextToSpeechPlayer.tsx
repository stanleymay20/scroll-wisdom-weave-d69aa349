import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Volume2, VolumeX, Play, Pause, Settings, Loader2, Square, AlertCircle } from "lucide-react";
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
  // NEVER block paid users - if in doubt, allow
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent || entitlements.isPaid;
  const canUseTTS = hasFullAccess || entitlements.canUseTTS;

  const base64ToBlobUrl = useCallback((base64: string, mimeType = "audio/mpeg") => {
    // Convert base64 → Blob URL (faster + avoids massive data: URIs)
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  }, []);

  const sanitizeTextForTTS = useCallback((raw: string) => {
    return raw
      // Remove markdown images entirely
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      // Remove base64 data urls if they appear inline
      .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, " ")
      // Remove headings markers
      .replace(/#{1,6}\s*/g, "")
      // Remove code blocks + inline code
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]+`/g, " ")
      // Links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Bullets
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // Collapse whitespace
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

    // Fallback if no punctuation-based split happened
    if (chunks.length === 0) return [text.slice(0, maxChars)];

    return chunks;
  }, []);

  const stopRef = useRef(false);
  const activeBlobUrlsRef = useRef<string[]>([]);

  const cleanupBlobUrls = useCallback(() => {
    for (const url of activeBlobUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    activeBlobUrlsRef.current = [];
  }, []);

  const playUrl = useCallback(async (url: string) => {
    return new Promise<void>((resolve, reject) => {
      if (stopRef.current) {
        resolve();
        return;
      }

      const audio = new Audio();
      audioRef.current = audio;

      audio.volume = volume;

      audio.onplay = () => {
        setIsPlaying(true);
        setError(null);
        onPlayingChange?.(true);
      };

      audio.onended = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      };

      audio.src = url;
      // Handle AbortError gracefully when play is interrupted by pause
      audio.play().then(() => {
        // Playing started successfully
      }).catch((err) => {
        // Ignore AbortError (happens when stop() is called during playback start)
        if (err.name === "AbortError") {
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }, [onPlayingChange, volume]);

  const generateSpeech = useCallback(async () => {
    const cleaned = sanitizeTextForTTS(text || "");

    if (!cleaned) {
      toast({
        title: "No text",
        description: "No readable text found",
        variant: "destructive",
      });
      return;
    }

    setError(null);
    setIsLoading(true);
    stopRef.current = false;
    setProgress(0);

    // Stop any existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    cleanupBlobUrls();

    let chunks = chunkText(cleaned, 800);

    // Faster “time to first audio”: make the first chunk smaller.
    if (chunks[0] && chunks[0].length > 260) {
      const first = chunks[0].slice(0, 260);
      const rest = chunks[0].slice(260).trim();
      chunks = [first, ...(rest ? [rest] : []), ...chunks.slice(1)];
    }

    console.log("[TTS Client] Chunked playback:", { chunks: chunks.length });

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current) break;

        const chunk = chunks[i];
        console.log("[TTS Client] Generating chunk", i + 1, "/", chunks.length, { len: chunk.length });

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: {
            text: chunk,
            voice: selectedVoice,
            language,
          },
        });

        if (invokeError) throw new Error(invokeError.message || "Failed to invoke TTS function");
        if (data?.error) throw new Error(data.error);
        if (!data?.audioContent) throw new Error("No audio content received from server");

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);

        // First audio should start ASAP
        if (i === 0) setIsLoading(false);

        await playUrl(url);
      }
    } catch (err) {
      // Don't log or show toast for AbortError - it's expected when user stops playback
      if (err instanceof Error && err.name === "AbortError") {
        console.log("[TTS Client] Playback stopped by user");
      } else {
        console.error("[TTS Client] Error:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to generate speech";
        setError(errorMessage);
        toast({
          title: "TTS Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      onPlayingChange?.(false);
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
  ]);

  const stop = useCallback(() => {
    stopRef.current = true;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    cleanupBlobUrls();

    setIsLoading(false);
    setIsPlaying(false);
    setProgress(0);
    setError(null);
    onPlayingChange?.(false);
  }, [cleanupBlobUrls, onPlayingChange]);

  // Stop audio when changing pages (or any parent-controlled stopKey changes)
  useEffect(() => {
    if (stopKey === undefined) return;
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey]);

  // Cleanup on unmount to avoid “audio continues after navigation”
  useEffect(() => {
    return () => stop();
  }, [stop]);

  const togglePlayPause = useCallback(() => {
    if (isLoading) return;

    // For chunked playback, "pause" behaves like stop (to avoid hanging the generation loop).
    if (isPlaying) {
      stop();
      return;
    }

    generateSpeech();
  }, [generateSpeech, isLoading, isPlaying, stop]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  // Don't render if user doesn't have TTS access - but FAIL-OPEN during loading
  // If entitlements indicate paid status, always show
  if (!canUseTTS && !entitlements.isPaid && !entitlements.isAdmin) {
    return null;
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
                  onValueChange={([v]) => handleVolumeChange(v / 100)}
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
