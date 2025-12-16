import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Volume2, VolumeX, Play, Pause, Settings, Loader2, Square } from "lucide-react";
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
  const [volume, setVolume] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  
  // Use centralized entitlements
  const entitlements = useEntitlements();
  const canUseTTS = entitlements.canUseTTS || entitlements.isAdmin || entitlements.isProphet || entitlements.isPremium || entitlements.isScrollStudent;

  const generateSpeech = useCallback(async () => {
    if (!text || text.trim().length === 0) {
      toast({
        title: "No text",
        description: "No readable text found",
        variant: "destructive",
      });
      return;
    }

    // Check TTS access
    if (!canUseTTS) {
      toast({
        title: "Upgrade Required",
        description: "Text-to-speech is available on Premium and Prophet plans",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: { 
          text: text.slice(0, 4096), // Limit text length
          voice: selectedVoice,
          language,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.audioContent) {
        throw new Error("No audio content received");
      }

      // Create audio from base64
      const audioBlob = new Blob(
        [Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0))],
        { type: "audio/mpeg" }
      );
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audio.volume = volume;
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        onPlayingChange?.(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        onPlayingChange?.(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        setIsPlaying(false);
        setIsLoading(false);
        onPlayingChange?.(false);
        toast({
          title: "Playback error",
          description: "Failed to play audio",
          variant: "destructive",
        });
      };

      audio.ontimeupdate = () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };

      await audio.play();
    } catch (error) {
      console.error("TTS error:", error);
      toast({
        title: "TTS Failed",
        description: error instanceof Error ? error.message : "Failed to generate speech",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedVoice, language, volume, onPlayingChange, toast, canUseTTS]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setProgress(0);
    onPlayingChange?.(false);
  }, [onPlayingChange]);

  const togglePlayPause = useCallback(() => {
    if (isLoading) return;
    
    if (!isPlaying) {
      if (audioRef.current && audioRef.current.currentTime > 0) {
        // Resume existing audio
        audioRef.current.play();
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

  // Don't render if user doesn't have TTS access and not admin/prophet
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
        >
          <Square className="h-4 w-4" />
        </Button>
      )}

      {/* Progress */}
      {(isPlaying || progress > 0) && (
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
          <Button variant="ghost" size="icon" className="h-8 w-8">
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
