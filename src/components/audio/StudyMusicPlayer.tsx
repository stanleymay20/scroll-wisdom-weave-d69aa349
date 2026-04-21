/**
 * Study Music Player — Streams curated study music tracks
 *
 * Architecture:
 *  - Real MP3s live in the `study-music` Supabase storage bucket and are
 *    catalogued in `study_music_tracks` (status = 'ready').
 *  - On first interaction, we resolve the public URL (cached in-memory + DB)
 *    and create the <audio> element SYNCHRONOUSLY inside the user gesture
 *    so play() is always allowed and pause() always reaches a real element.
 *  - For tracks without a cached MP3 yet, we fall back to procedural Web Audio
 *    synthesis so users still get an ambient track.
 *
 * Reliability rules (fixes the "pause does nothing" bug):
 *  1. NEVER create the Audio element after an `await` — always inside the click handler.
 *  2. Track the in-flight play() promise; pause() awaits it before pausing.
 *  3. A single `currentAudioRef` is the source of truth — replaced atomically.
 *  4. State (`isPlaying`) is driven by audio events (`play`/`pause`/`ended`),
 *     never by optimistic UI alone, so the button always reflects reality.
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
import { useIsMobile } from "@/hooks/use-mobile";

interface MusicTrack {
  id: string;
  label: string;
  emoji: string;
  category: "classical" | "ambient" | "focus" | "nature";
  /** When true, this track has no MP3 yet — uses procedural fallback */
  proceduralOnly?: boolean;
}

const STUDY_TRACKS: MusicTrack[] = [
  // Classical Masters
  { id: "bach-cello-suite",      label: "Bach Cello Suite",   emoji: "🎻", category: "classical" },
  { id: "debussy-clair-de-lune", label: "Clair de Lune",      emoji: "🌙", category: "classical" },
  { id: "symphony-adagio",       label: "Adagios",            emoji: "🎼", category: "classical" },
  { id: "vivaldi-seasons",       label: "Four Seasons",       emoji: "🍂", category: "classical" },
  { id: "beethoven-moonlight",   label: "Moonlight Sonata",   emoji: "🎹", category: "classical" },
  { id: "chopin-nocturne",       label: "Nocturne",           emoji: "✨", category: "classical" },

  // Focus & Study
  { id: "ambient-focus", label: "Deep Focus",     emoji: "🧠", category: "focus" },
  { id: "lofi-study",    label: "Lo-Fi Study",    emoji: "📚", category: "focus" },
  { id: "christian-study", label: "Christian Study", emoji: "✝️", category: "focus" },

  // Ambient & Jazz
  { id: "jazz-cafe",       label: "Jazz Café",   emoji: "🎷", category: "ambient" },
  { id: "spa-meditation",  label: "Zen Garden",  emoji: "🧘", category: "ambient" },

  // Nature & Piano
  { id: "rain-piano",            label: "Rainy Day Piano", emoji: "🌧️", category: "nature" },
  { id: "forest-morning",        label: "Forest Morning",  emoji: "🌲", category: "nature" },
  { id: "rainy-forest-pomodoro", label: "Rainy Forest",    emoji: "🌿", category: "nature" },
  { id: "forest-ambience",       label: "Forest Ambience", emoji: "☀️", category: "nature" },
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

type PlayMode = "stream" | "procedural";

export function StudyMusicPlayer({ className, autoExpand = false }: StudyMusicPlayerProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(autoExpand);
  const [isExpanded, setIsExpanded] = useState(autoExpand);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [volume, setVolume] = useState(40);
  const [isMuted, setIsMuted] = useState(false);
  const prevVolumeRef = useRef(40);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const proceduralRef = useRef<ProceduralMusicSession | null>(null);
  const playModeRef = useRef<PlayMode | null>(null);
  const trackUrlCache = useRef<Map<string, string>>(new Map());

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch { /* noop */ }
        audioRef.current.src = "";
        audioRef.current = null;
      }
      proceduralRef.current?.stop();
      proceduralRef.current = null;
    };
  }, []);

  // --- Volume sync ---
  useEffect(() => {
    const v = (isMuted ? 0 : volume) / 100;
    if (audioRef.current) audioRef.current.volume = v;
    proceduralRef.current?.setVolume(v);
  }, [volume, isMuted]);

  // --- Resolve a public URL for a track from the cache → DB ---
  // NOTE: This may be awaited — only call BEFORE creating the Audio element
  // OR when the element is already created and we just need to set its src later.
  const resolveTrackUrl = useCallback(async (trackId: string): Promise<string | null> => {
    const cached = trackUrlCache.current.get(trackId);
    if (cached) return cached;

    // Try the deterministic public URL first (we know our naming convention)
    const directPath = `${trackId}.mp3`;
    const { data: directUrl } = supabase.storage.from("study-music").getPublicUrl(directPath);

    // Verify the file actually exists by checking the DB row
    const { data: row } = await supabase
      .from("study_music_tracks")
      .select("storage_path, status")
      .eq("track_key", trackId)
      .maybeSingle();

    if (row?.status === "ready" && row.storage_path) {
      const { data } = supabase.storage.from("study-music").getPublicUrl(row.storage_path);
      trackUrlCache.current.set(trackId, data.publicUrl);
      return data.publicUrl;
    }

    // Optimistic: if the file matches our naming convention, try it
    if (directUrl?.publicUrl) {
      try {
        const head = await fetch(directUrl.publicUrl, { method: "HEAD" });
        if (head.ok) {
          trackUrlCache.current.set(trackId, directUrl.publicUrl);
          return directUrl.publicUrl;
        }
      } catch { /* network error — fall through to null */ }
    }

    return null;
  }, []);

  // --- Hard stop everything ---
  const teardown = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* noop */ }
      audioRef.current.onplay = null;
      audioRef.current.onpause = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.src = "";
      audioRef.current.load();
      audioRef.current = null;
    }
    playPromiseRef.current = null;
    proceduralRef.current?.stop();
    proceduralRef.current = null;
    playModeRef.current = null;
  }, []);

  // --- Pause-aware: waits for any in-flight play() before pausing ---
  const safePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    // Wait for any in-flight play() so the browser doesn't reject the pause
    if (playPromiseRef.current) {
      try { await playPromiseRef.current; } catch { /* play was rejected — ok */ }
    }
    if (!audio.paused) {
      try { audio.pause(); } catch { /* noop */ }
    }
  }, []);

  // --- Play/pause toggle for the currently-active track ---
  const togglePlayback = useCallback(async () => {
    if (playModeRef.current === "procedural") {
      if (isPlaying) {
        proceduralRef.current?.stop();
        proceduralRef.current = null;
        setIsPlaying(false);
      } else if (activeTrackId) {
        const session = startProceduralMusic(activeTrackId, (isMuted ? 0 : volume) / 100);
        proceduralRef.current = session;
        setIsPlaying(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      await safePause();
      // isPlaying will flip to false via the 'pause' event listener
    } else {
      try {
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
      } catch (err) {
        console.error("[StudyMusic] Resume play failed:", err);
      }
    }
  }, [isPlaying, activeTrackId, isMuted, volume, safePause]);

  // --- Select a different track (or toggle if same) ---
  // CRITICAL: Audio element is created SYNCHRONOUSLY inside the click handler.
  const selectTrack = useCallback(async (track: MusicTrack) => {
    // Same track → just toggle
    if (activeTrackId === track.id) {
      void togglePlayback();
      return;
    }

    // Stop whatever's playing
    teardown();

    setActiveTrackId(track.id);
    setIsPlaying(false);

    // ── Procedural-only track (no MP3 yet) ──
    if (track.proceduralOnly) {
      try {
        const session = startProceduralMusic(track.id, (isMuted ? 0 : volume) / 100);
        proceduralRef.current = session;
        playModeRef.current = "procedural";
        setIsPlaying(true);
        toast.info(`Playing ${track.label} (synthesized)`, {
          description: "Studio recording coming soon",
          duration: 2500,
        });
      } catch (err) {
        console.error("[StudyMusic] Procedural start failed:", err);
        setActiveTrackId(null);
        toast.error("Could not start audio");
      }
      return;
    }

    // ── Real MP3 track ──
    // Try cached URL first so we can build the Audio element synchronously
    const cachedUrl = trackUrlCache.current.get(track.id);

    // Build Audio element NOW (inside the gesture window)
    const audio = new Audio();
    audio.loop = true;
    audio.volume = (isMuted ? 0 : volume) / 100;
    audio.preload = "auto";

    // Wire event-driven state (single source of truth)
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      console.error("[StudyMusic] Audio element error", audio.error);
      setIsPlaying(false);
      toast.error("Could not load this track");
    };

    audioRef.current = audio;
    playModeRef.current = "stream";

    if (cachedUrl) {
      // Fast path: synchronous play within gesture
      audio.src = cachedUrl;
      try {
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
      } catch (err) {
        console.error("[StudyMusic] Play failed:", err);
      }
      return;
    }

    // Slow path: need to resolve URL first. The Audio element exists, so a later
    // pause() will work correctly. But play() after await may need a re-click on
    // strict browsers — most allow it because the gesture context for THIS
    // element has been granted by creating it inside the gesture.
    setIsLoading(track.id);
    const url = await resolveTrackUrl(track.id);
    setIsLoading(null);

    // The user might have clicked another track while we were resolving
    if (audioRef.current !== audio) return;

    if (!url) {
      toast.error(`${track.label} isn't ready yet`, {
        description: "Try a different track",
      });
      teardown();
      setActiveTrackId(null);
      return;
    }

    audio.src = url;
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
    } catch (err) {
      console.warn("[StudyMusic] Auto-play after fetch failed; user can press play.", err);
      // Audio is loaded; user just needs to tap play. State is already false.
    }
  }, [activeTrackId, togglePlayback, teardown, isMuted, volume, resolveTrackUrl]);

  const stopMusic = useCallback(() => {
    teardown();
    setActiveTrackId(null);
    setIsPlaying(false);
    // Clear lock-screen metadata
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch { /* noop */ }
    }
  }, [teardown]);

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

  // ── Media Session API: lock-screen + hardware media key controls ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!activeTrack) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch { /* noop */ }
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeTrack.label,
        artist: 'ScrollLibrary · Study Music',
        album: CATEGORY_LABELS[activeTrack.category] ?? 'Focus',
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      navigator.mediaSession.setActionHandler('play', () => { void togglePlayback(); });
      navigator.mediaSession.setActionHandler('pause', () => { void togglePlayback(); });
      navigator.mediaSession.setActionHandler('stop', () => { stopMusic(); });
      // Skip = next/previous track in the curated list
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const idx = STUDY_TRACKS.findIndex(t => t.id === activeTrack.id);
        const next = STUDY_TRACKS[(idx + 1) % STUDY_TRACKS.length];
        void selectTrack(next);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const idx = STUDY_TRACKS.findIndex(t => t.id === activeTrack.id);
        const prev = STUDY_TRACKS[(idx - 1 + STUDY_TRACKS.length) % STUDY_TRACKS.length];
        void selectTrack(prev);
      });
    } catch (err) {
      console.warn('[StudyMusic] MediaSession setup failed:', err);
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch { /* noop */ }
    };
  }, [activeTrack, isPlaying, togglePlayback, stopMusic, selectTrack]);

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
        key="study-music-panel"
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        className={cn(
          "bg-card border border-border rounded-xl shadow-lg overflow-hidden",
          // Mobile: nearly full width, capped. Desktop: fixed 18rem.
          "w-[min(22rem,calc(100vw-2rem))] sm:w-72",
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
            {/* Always-visible play/pause in header when a track is active */}
            {activeTrack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary"
                onClick={() => { void togglePlayback(); }}
                disabled={isLoading === activeTrack.id}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isLoading === activeTrack.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? "Collapse" : "Expand"}
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
              className="h-8 w-8"
              onClick={() => {
                stopMusic();
                setIsOpen(false);
              }}
              aria-label="Close"
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
              onClick={() => {
                // Same-track click: just toggle, never re-create
                void togglePlayback();
              }}
              disabled={isLoading === activeTrack.id}
              aria-label={isPlaying ? "Pause" : "Play"}
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
              aria-label={isMuted ? "Unmute" : "Mute"}
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

              <p className="text-[10px] text-muted-foreground/60 text-center px-2 pt-1">
                Tracks loop continuously. Tap any track to switch instantly.
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
