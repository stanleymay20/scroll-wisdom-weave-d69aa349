import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Volume2, VolumeX, Play, Pause, Settings, SkipForward, SkipBack } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TextToSpeechPlayerProps {
  text: string;
  onPlayingChange?: (playing: boolean) => void;
}

const voices = [
  { id: "default", name: "Default" },
  { id: "en-US-1", name: "US English (Female)" },
  { id: "en-US-2", name: "US English (Male)" },
  { id: "en-GB-1", name: "British English" },
];

export function TextToSpeechPlayer({ text, onPlayingChange }: TextToSpeechPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState("default");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [progress, setProgress] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices.filter(v => v.lang.startsWith("en")));
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const cleanTextForSpeech = useCallback((rawText: string): string => {
    return rawText
      .replace(/#{1,6}\s*/g, "") // Remove markdown headers
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
      .replace(/`[^`]+`/g, "") // Remove inline code
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to just text
      .replace(/^\s*[-*]\s+/gm, "") // Remove list markers
      .replace(/^\s*\d+\.\s+/gm, "") // Remove numbered list markers
      .replace(/\n{2,}/g, ". ") // Replace multiple newlines with pause
      .replace(/\n/g, " ") // Replace single newlines with space
      .replace(/\s{2,}/g, " ") // Normalize spaces
      .trim();
  }, []);

  const speak = useCallback(() => {
    if (!window.speechSynthesis) {
      toast({
        title: "Not supported",
        description: "Text-to-speech is not supported in your browser",
        variant: "destructive",
      });
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const cleanedText = cleanTextForSpeech(text);
    if (!cleanedText) {
      toast({
        title: "No text",
        description: "No readable text found",
        variant: "destructive",
      });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.volume = volume;
    utterance.rate = rate;

    // Set voice
    if (selectedVoice !== "default" && availableVoices.length > 0) {
      const voice = availableVoices.find(v => v.name.includes(selectedVoice));
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      onPlayingChange?.(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(0);
      onPlayingChange?.(false);
    };

    utterance.onerror = (event) => {
      console.error("Speech error:", event);
      setIsPlaying(false);
      setIsPaused(false);
      onPlayingChange?.(false);
    };

    // Track progress (approximate)
    const totalLength = cleanedText.length;
    utterance.onboundary = (event) => {
      setProgress((event.charIndex / totalLength) * 100);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [text, volume, rate, selectedVoice, availableVoices, cleanTextForSpeech, onPlayingChange, toast]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    onPlayingChange?.(false);
  }, [onPlayingChange]);

  const togglePlayPause = useCallback(() => {
    if (!isPlaying) {
      speak();
    } else if (isPaused) {
      resume();
    } else {
      pause();
    }
  }, [isPlaying, isPaused, speak, resume, pause]);

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2 border border-border/50">
      {/* Play/Pause Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        className="h-8 w-8"
      >
        {isPlaying && !isPaused ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Stop Button */}
      {isPlaying && (
        <Button
          variant="ghost"
          size="icon"
          onClick={stop}
          className="h-8 w-8"
        >
          <VolumeX className="h-4 w-4" />
        </Button>
      )}

      {/* Progress */}
      {isPlaying && (
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
                <Volume2 className="h-4 w-4 text-muted-foreground" />
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
              <label className="text-sm font-medium">Speed: {rate}x</label>
              <Slider
                value={[rate * 100]}
                onValueChange={([v]) => setRate(v / 100)}
                min={50}
                max={200}
                step={25}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System Default</SelectItem>
                  {availableVoices.slice(0, 5).map((voice, i) => (
                    <SelectItem key={i} value={voice.name}>
                      {voice.name.slice(0, 25)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}