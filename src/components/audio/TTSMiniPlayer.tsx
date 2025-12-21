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
  AlertCircle 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/hooks/useEntitlements";
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
}

export function TTSMiniPlayer({ 
  chapterText, 
  selectedText, 
  language = "en", 
  onClose,
  stopKey 
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeBlobUrlsRef = useRef<string[]>([]);
  const prevStopKeyRef = useRef<string | number | undefined>(undefined);

  const { toast } = useToast();
  const entitlements = useEntitlements();

  const hasAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || 
                   entitlements.isScrollStudent || entitlements.isPaid || entitlements.canUseTTS;

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

  const chunkText = useCallback((input: string, maxChars = 800) => {
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

  const playUrl = useCallback(async (url: string) => {
    return new Promise<void>((resolve) => {
      if (stopRef.current) {
        resolve();
        return;
      }

      const audio = new Audio();
      audioRef.current = audio;
      audio.volume = volume;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => resolve();
      audio.onpause = () => { if (stopRef.current) resolve(); };
      audio.onerror = () => resolve();
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      };

      audio.src = url;
      audio.play().catch(() => resolve());
    });
  }, [volume]);

  const stop = useCallback(() => {
    stopRef.current = true;

    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    cleanupBlobUrls();
    setIsLoading(false);
    setIsPlaying(false);
    setProgress(0);
    setCurrentChunk(0);
    setError(null);
  }, [cleanupBlobUrls]);

  const generateSpeech = useCallback(async (textToRead: string, isSelection = false) => {
    const cleaned = sanitizeText(textToRead);
    if (!cleaned) {
      toast({ title: "No text", description: "No readable text found", variant: "destructive" });
      return;
    }

    setError(null);
    setIsLoading(true);
    stopRef.current = false;
    setProgress(0);
    setMode(isSelection ? "selection" : "chapter");

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    cleanupBlobUrls();

    // For selection, use a single small chunk
    let chunks = isSelection 
      ? [cleaned.slice(0, 1500)] 
      : chunkText(cleaned, 800);

    // Make first chunk smaller for faster start
    if (!isSelection && chunks[0] && chunks[0].length > 260) {
      const first = chunks[0].slice(0, 260);
      const rest = chunks[0].slice(260).trim();
      chunks = [first, ...(rest ? [rest] : []), ...chunks.slice(1)];
    }

    setTotalChunks(chunks.length);

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (stopRef.current) break;

        setCurrentChunk(i + 1);
        const chunk = chunks[i];

        // Create abort controller for this request
        abortControllerRef.current = new AbortController();

        const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
          body: { text: chunk, voice: selectedVoice, language },
        });

        if (stopRef.current) break;
        if (invokeError) throw new Error(invokeError.message || "TTS failed");
        if (data?.error) throw new Error(data.error);
        if (!data?.audioContent) throw new Error("No audio received");

        const url = base64ToBlobUrl(data.audioContent, data.contentType || "audio/mpeg");
        activeBlobUrlsRef.current.push(url);

        if (i === 0) setIsLoading(false);

        await playUrl(url);
      }
    } catch (err) {
      if (err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"))) {
        console.log("[TTS] Playback cancelled");
      } else {
        console.error("[TTS] Error:", err);
        const msg = err instanceof Error ? err.message : "TTS failed";
        setError(msg);
        toast({ title: "TTS Error", description: msg, variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
      setIsPlaying(false);
      setProgress(0);
      setCurrentChunk(0);
    }
  }, [sanitizeText, chunkText, cleanupBlobUrls, base64ToBlobUrl, playUrl, selectedVoice, language, toast]);

  // Stop on stopKey change (page navigation)
  useEffect(() => {
    if (stopKey === undefined) return;
    if (prevStopKeyRef.current !== undefined && prevStopKeyRef.current !== stopKey) {
      stop();
    }
    prevStopKeyRef.current = stopKey;
  }, [stopKey, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stop();
  }, [stop]);

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
      stop();
      setTimeout(() => generateSpeech(selectedText, true), 50);
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
                  onValueChange={([v]) => {
                    setVolume(v / 100);
                    if (audioRef.current) audioRef.current.volume = v / 100;
                  }}
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
