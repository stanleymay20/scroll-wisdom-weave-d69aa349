import { useState, useRef, useCallback } from "react";
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

export function TextToSpeechPlayer({ text, language = "en", onPlayingChange }: TextToSpeechPlayerProps) {
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
  
  // Full access check - Admin, Prophet, Premium, Student all have TTS
  const hasFullAccess = entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent;
  const canUseTTS = hasFullAccess || entitlements.canUseTTS || entitlements.isPaid;

  const generateSpeech = useCallback(async () => {
    if (!text || text.trim().length === 0) {
      toast({
        title: "No text",
        description: "No readable text found",
        variant: "destructive",
      });
      return;
    }

    // Clear previous error
    setError(null);
    setIsLoading(true);

    console.log("[TTS Client] Starting speech generation...");

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("text-to-speech", {
        body: { 
          text: text.slice(0, 4096), // Limit text length
          voice: selectedVoice,
          language,
        },
      });

      console.log("[TTS Client] Response:", { data: data ? "received" : "null", error: invokeError });

      if (invokeError) {
        throw new Error(invokeError.message || "Failed to invoke TTS function");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.audioContent) {
        throw new Error("No audio content received from server");
      }

      console.log("[TTS Client] Audio content received, length:", data.audioContent.length);

      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Create audio from base64 using data URI
      const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
      const audio = new Audio();
      
      // Set up event handlers before setting src
      audio.oncanplaythrough = () => {
        console.log("[TTS Client] Audio can play through");
        setIsLoading(false);
        audio.play().catch(e => {
          console.error("[TTS Client] Play error:", e);
          setError("Failed to play audio. Try clicking play again.");
          setIsLoading(false);
        });
      };

      audio.onplay = () => {
        console.log("[TTS Client] Audio playing");
        setIsPlaying(true);
        setError(null);
        onPlayingChange?.(true);
      };

      audio.onended = () => {
        console.log("[TTS Client] Audio ended");
        setIsPlaying(false);
        setProgress(0);
        onPlayingChange?.(false);
      };

      audio.onerror = (e) => {
        console.error("[TTS Client] Audio error:", e);
        setIsPlaying(false);
        setIsLoading(false);
        setError("Failed to play audio");
        onPlayingChange?.(false);
      };

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      audio.volume = volume;
      audioRef.current = audio;
      
      // Set source to trigger load
      audio.src = audioUrl;
      audio.load();
      
    } catch (err) {
      console.error("[TTS Client] Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate speech";
      setError(errorMessage);
      toast({
        title: "TTS Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [text, selectedVoice, language, volume, onPlayingChange, toast]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
    setError(null);
    onPlayingChange?.(false);
  }, [onPlayingChange]);

  const togglePlayPause = useCallback(() => {
    if (isLoading) return;
    
    if (!isPlaying) {
      if (audioRef.current && audioRef.current.currentTime > 0 && audioRef.current.src) {
        // Resume existing audio
        audioRef.current.play().catch(e => {
          console.error("[TTS Client] Resume error:", e);
          // If resume fails, generate new speech
          generateSpeech();
        });
      } else {
        // Generate new speech
        generateSpeech();
      }
    } else {
      // Pause
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        onPlayingChange?.(false);
      }
    }
  }, [isPlaying, isLoading, generateSpeech, onPlayingChange]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  // Don't render if user doesn't have TTS access
  if (!canUseTTS) {
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
