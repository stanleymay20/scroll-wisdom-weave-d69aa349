/**
 * Study Music Player — Streams world-class AI-generated study music
 * Generates real music via ElevenLabs, caches in cloud storage
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
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
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { startProceduralMusic, type ProceduralMusicSession } from "@/lib/proceduralMusic";

interface MusicTrack {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
  category: "classical" | "ambient" | "focus" | "nature";
}

const STUDY_TRACKS: MusicTrack[] = [
  {
    id: "beethoven-moonlight",
    label: "Moonlight Sonata",
    emoji: "🎹",
    prompt: "Soft, gentle classical piano piece inspired by Beethoven's Moonlight Sonata first movement. Slow, contemplative, peaceful adagio in C-sharp minor. Perfect for deep study and concentration. No vocals, pure piano.",
    category: "classical",
  },
  {
    id: "bach-cello-suite",
    label: "Cello Suite",
    emoji: "🎻",
    prompt: "Elegant solo cello performance inspired by Bach's Cello Suite No. 1 Prelude in G major. Warm, flowing baroque music with gentle arpeggios. Calm and meditative instrumental for studying.",
    category: "classical",
  },
  {
    id: "debussy-clair-de-lune",
    label: "Clair de Lune",
    emoji: "🌙",
    prompt: "Dreamy impressionist piano piece inspired by Debussy's Clair de Lune. Soft, ethereal, and contemplative with gentle flowing melodies. Romantic classical piano perfect for reading and focus.",
    category: "classical",
  },
  {
    id: "symphony-adagio",
    label: "Symphony Adagio",
    emoji: "🎼",
    prompt: "Lush orchestral adagio movement with strings, woodwinds, and soft brass. Inspired by Barber's Adagio for Strings. Slow, emotional, sweeping classical symphony. Deeply calming instrumental for deep work.",
    category: "classical",
  },
  {
    id: "vivaldi-seasons",
    label: "Four Seasons",
    emoji: "🍂",
    prompt: "Elegant baroque violin concerto inspired by Vivaldi's Four Seasons Spring movement. Bright, uplifting string ensemble with solo violin. Energizing classical music for productive study sessions.",
    category: "classical",
  },
  {
    id: "chopin-nocturne",
    label: "Nocturne",
    emoji: "✨",
    prompt: "Romantic solo piano nocturne inspired by Chopin. Gentle, expressive, flowing melody with delicate ornamentations. Intimate and beautiful night music for quiet studying.",
    category: "classical",
  },
  {
    id: "ambient-focus",
    label: "Deep Focus",
    emoji: "🧠",
    prompt: "Ambient electronic deep focus music with soft synthesizer pads, gentle evolving textures, and subtle rhythmic pulses. Minimal, calming, and non-distracting. Perfect background for intense study sessions.",
    category: "focus",
  },
  {
    id: "lofi-study",
    label: "Lo-Fi Study",
    emoji: "📚",
    prompt: "Warm lo-fi hip hop beats for studying. Mellow jazzy piano chords, soft vinyl crackle, relaxed drum beats, smooth bass. Chill and cozy cafe atmosphere. Instrumental only, no vocals.",
    category: "focus",
  },
  {
    id: "jazz-cafe",
    label: "Jazz Café",
    emoji: "🎷",
    prompt: "Smooth jazz cafe music with soft saxophone melody, gentle piano comping, upright bass walking lines, and brushed drums. Warm, sophisticated, and relaxing. Perfect coffeehouse study ambience.",
    category: "ambient",
  },
  {
    id: "spa-meditation",
    label: "Zen Garden",
    emoji: "🧘",
    prompt: "Peaceful zen meditation music with singing bowls, soft flute, gentle water sounds, and ambient pads. Serene and tranquil Eastern-inspired spa music for mindful studying.",
    category: "ambient",
  },
  {
    id: "rain-piano",
    label: "Rainy Day Piano",
    emoji: "🌧️",
    prompt: "Gentle piano music with soft rain sounds in the background. Slow, peaceful, melancholic piano melodies blending with rainfall. Cozy rainy day atmosphere for reading and concentration.",
    category: "nature",
  },
  {
    id: "forest-morning",
    label: "Forest Morning",
    emoji: "🌲",
    prompt: "Peaceful morning forest ambience with bird songs, gentle acoustic guitar, soft flute, and nature sounds. Fresh, organic, and uplifting. Calming woodland atmosphere for focused study.",
    category: "nature",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  classical: "Classical Masters",
  focus: "Focus & Study",
  ambient: "Ambient & Jazz",
  nature: "Nature & Piano",
};

const CATEGORY_ORDER = ["classical", "focus", "ambient", "nature"];

interface StudyMusicPlayerProps {
  className?: string;
  autoExpand?: boolean;
}

export function StudyMusicPlayer({ className, autoExpand = false }: StudyMusicPlayerProps) {
  const [isOpen, setIsOpen] = useState(autoExpand);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [volume, setVolume] = useState(40);
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef(40);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackUrlCache = useRef<Map<string, string>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = (isMuted ? 0 : volume) / 100;
    }
  }, [volume, isMuted]);

  const fetchOrGenerateTrack = useCallback(async (track: MusicTrack): Promise<string | null> => {
    // Check cache first
    const cached = trackUrlCache.current.get(track.id);
    if (cached) return cached;

    try {
      // Check if already generated in DB
      const { data: existing } = await supabase
        .from("study_music_tracks")
        .select("storage_path, status")
        .eq("track_key", track.id)
        .single();

      if (existing?.storage_path && existing.status === "ready") {
        const { data: urlData } = supabase.storage
          .from("study-music")
          .getPublicUrl(existing.storage_path);
        trackUrlCache.current.set(track.id, urlData.publicUrl);
        return urlData.publicUrl;
      }

      // Generate via edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-study-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            trackKey: track.id,
            prompt: track.prompt,
            duration: 120,
          }),
        }
      );

      if (!response.ok) {
        console.error("[StudyMusic] Generation failed:", response.status);
        return null;
      }

      const data = await response.json();
      
      // Handle plan-required / fallback errors
      if (data.error === "PLAN_REQUIRED" || data.fallback) {
        toast.error("Study music requires an upgraded ElevenLabs plan", {
          description: "Please upgrade at elevenlabs.io/pricing to enable AI music generation.",
          duration: 6000,
        });
        return null;
      }

      if (data.url) {
        trackUrlCache.current.set(track.id, data.url);
        return data.url;
      }
      return null;
    } catch (err) {
      console.error("[StudyMusic] Error fetching track:", err);
      return null;
    }
  }, []);

  const selectTrack = useCallback(async (track: MusicTrack) => {
    // Same track — toggle play/pause
    if (activeTrackId === track.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play().catch(() => {});
        setIsPlaying(true);
      }
      return;
    }

    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    setActiveTrackId(track.id);
    setIsLoading(track.id);
    setIsPlaying(false);

    const url = await fetchOrGenerateTrack(track);
    setIsLoading(null);

    if (!url) return;

    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = (isMuted ? 0 : volume) / 100;
    audio.crossOrigin = "anonymous";

    audio.addEventListener("canplaythrough", () => {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }, { once: true });

    audio.addEventListener("error", () => {
      console.error("[StudyMusic] Audio playback error");
      setIsPlaying(false);
      setActiveTrackId(null);
    });

    audioRef.current = audio;
    audio.load();
  }, [activeTrackId, isPlaying, fetchOrGenerateTrack, isMuted, volume]);

  const stopMusic = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
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

  const activeTrack = STUDY_TRACKS.find((t) => t.id === activeTrackId);

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const tracks = STUDY_TRACKS.filter((t) => t.category === cat);
    if (tracks.length > 0) acc[cat] = tracks;
    return acc;
  }, {} as Record<string, MusicTrack[]>);

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
          <div className="flex items-center gap-2 min-w-0">
            <Music className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium">Study Music</span>
            {activeTrack && (
              <Badge variant="secondary" className="text-[10px] h-5 gap-1 truncate max-w-[100px]">
                {activeTrack.emoji} {activeTrack.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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

        {/* Controls */}
        {activeTrack && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-none"
              onClick={() => selectTrack(activeTrack)}
              disabled={isLoading === activeTrack.id}
            >
              {isLoading === activeTrack.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
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
            <div className="p-2 max-h-72 overflow-y-auto space-y-3">
              {Object.entries(grouped).map(([category, tracks]) => (
                <div key={category}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">
                    {CATEGORY_LABELS[category]}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {tracks.map((track) => {
                      const isActive = activeTrackId === track.id;
                      const loading = isLoading === track.id;
                      return (
                        <button
                          key={track.id}
                          onClick={() => selectTrack(track)}
                          disabled={loading}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm transition-all",
                            isActive
                              ? "bg-primary/10 border border-primary/30 text-foreground"
                              : "hover:bg-muted/50 border border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="text-base flex-shrink-0">{track.emoji}</span>
                          <span className="text-xs font-medium truncate">
                            {track.label}
                          </span>
                          {loading && (
                            <Loader2 className="ml-auto h-3 w-3 animate-spin flex-none text-primary" />
                          )}
                          {isActive && isPlaying && !loading && (
                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-none" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* First-time generation notice */}
              <p className="text-[10px] text-muted-foreground/60 text-center px-2 pt-1">
                First play generates your track (30-60s). After that it plays instantly.
              </p>
            </div>
          </motion.div>
        )}

        {/* Collapsed hint */}
        {!isExpanded && !activeTrack && (
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full px-3 py-3 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Tap to browse study music
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
