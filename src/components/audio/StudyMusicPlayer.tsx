/**
 * Study Music Player — Ambient sound mixer for focused reading
 * Plays royalty-free ambient loops (rain, jazz piano, lo-fi, nature, etc.)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  Volume2,
  VolumeX,
  Pause,
  Play,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AmbientTrack {
  id: string;
  label: string;
  emoji: string;
  /** Free ambient audio URL — uses freesound.org embeddable previews */
  url: string;
  category: "nature" | "music" | "ambient";
}

// Curated royalty-free ambient sounds hosted on reliable CDNs
const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    id: "rain",
    label: "Rainfall",
    emoji: "🌧️",
    url: "https://cdn.pixabay.com/audio/2022/05/13/audio_257112671f.mp3",
    category: "nature",
  },
  {
    id: "forest",
    label: "Forest",
    emoji: "🌲",
    url: "https://cdn.pixabay.com/audio/2022/08/31/audio_419263e0b1.mp3",
    category: "nature",
  },
  {
    id: "ocean",
    label: "Ocean Waves",
    emoji: "🌊",
    url: "https://cdn.pixabay.com/audio/2022/06/07/audio_1a6b1a72cd.mp3",
    category: "nature",
  },
  {
    id: "fireplace",
    label: "Fireplace",
    emoji: "🔥",
    url: "https://cdn.pixabay.com/audio/2024/11/05/audio_4956b4edd1.mp3",
    category: "ambient",
  },
  {
    id: "lofi",
    label: "Lo-Fi Beats",
    emoji: "🎵",
    url: "https://cdn.pixabay.com/audio/2023/07/19/audio_e1b3b29361.mp3",
    category: "music",
  },
  {
    id: "piano",
    label: "Soft Piano",
    emoji: "🎹",
    url: "https://cdn.pixabay.com/audio/2023/09/04/audio_4ef21e6738.mp3",
    category: "music",
  },
  {
    id: "jazz",
    label: "Jazz Café",
    emoji: "🎷",
    url: "https://cdn.pixabay.com/audio/2024/09/10/audio_6e56242c3a.mp3",
    category: "music",
  },
  {
    id: "whitenoise",
    label: "White Noise",
    emoji: "📻",
    url: "https://cdn.pixabay.com/audio/2022/03/24/audio_4b68be5d33.mp3",
    category: "ambient",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  nature: "Nature",
  music: "Music",
  ambient: "Ambient",
};

interface StudyMusicPlayerProps {
  className?: string;
}

export function StudyMusicPlayer({ className }: StudyMusicPlayerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(30);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevVolumeRef = useRef(30);

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = volume / 100;
    audio.preload = "none";
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsPlaying(false);
      console.warn("[StudyMusic] Audio failed to load");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const selectTrack = useCallback((track: AmbientTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (activeTrackId === track.id) {
      // Toggle play/pause
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(() => {});
      }
      return;
    }

    // Switch track
    audio.pause();
    audio.src = track.url;
    audio.load();
    setActiveTrackId(track.id);
    audio.play().catch(() => {});
  }, [activeTrackId, isPlaying]);

  const stopMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.src = "";
    setActiveTrackId(null);
    setIsPlaying(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolumeRef.current);
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const activeTrack = AMBIENT_TRACKS.find((t) => t.id === activeTrackId);

  // Group tracks by category
  const grouped = AMBIENT_TRACKS.reduce((acc, track) => {
    if (!acc[track.category]) acc[track.category] = [];
    acc[track.category].push(track);
    return acc;
  }, {} as Record<string, AmbientTrack[]>);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 relative", className)}
        onClick={() => setIsOpen(true)}
        title="Study Music"
      >
        <Music className="h-4 w-4" />
        {isPlaying && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
      </Button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        className={cn(
          "bg-card border border-border rounded-xl shadow-lg overflow-hidden w-72",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Study Music</span>
            {activeTrack && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                {activeTrack.emoji} {activeTrack.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                stopMusic();
                setIsOpen(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Controls — always visible when track active */}
        {activeTrack && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-none"
              onClick={() => selectTrack(activeTrack)}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-none"
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={([v]) => {
                setVolume(v);
                if (v > 0 && isMuted) setIsMuted(false);
              }}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
          </div>
        )}

        {/* Track List */}
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 max-h-64 overflow-y-auto space-y-3">
              {Object.entries(grouped).map(([category, tracks]) => (
                <div key={category}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">
                    {CATEGORY_LABELS[category]}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {tracks.map((track) => {
                      const isActive = activeTrackId === track.id;
                      return (
                        <button
                          key={track.id}
                          onClick={() => selectTrack(track)}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-all",
                            isActive
                              ? "bg-primary/10 border border-primary/30 text-foreground"
                              : "hover:bg-muted/50 border border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="text-base">{track.emoji}</span>
                          <span className="text-xs font-medium truncate">
                            {track.label}
                          </span>
                          {isActive && isPlaying && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-none" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Collapsed hint */}
        {!isExpanded && !activeTrack && (
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full px-3 py-3 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Tap to choose ambient sounds
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/** Compact trigger button for reader toolbar */
export function StudyMusicButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 justify-start"
      onClick={onClick}
    >
      <Music className="h-4 w-4" />
      <span className="text-xs">Study Music</span>
    </Button>
  );
}
