/**
 * Study Music Player — Web Audio API ambient sound generator
 * Generates ambient sounds client-side (no external URLs needed)
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
  generator: (ctx: AudioContext, gain: GainNode) => AudioNode[];
  category: "nature" | "music" | "ambient";
}

// --- Web Audio generators ---

function createWhiteNoise(ctx: AudioContext, gain: GainNode): AudioNode[] {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start();
  return [source];
}

function createBrownNoise(ctx: AudioContext, gain: GainNode): AudioNode[] {
  // Brown noise = accumulated white noise, sounds like rainfall/wind
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  // Low-pass for deeper rain sound
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 800;
  source.connect(lp);
  lp.connect(gain);
  source.start();
  return [source, lp];
}

function createOceanWaves(ctx: AudioContext, gain: GainNode): AudioNode[] {
  // Brown noise + slow LFO on filter = wave-like surges
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08; // slow wave cycle
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain);
  lfoGain.connect(lp.frequency);
  lfo.start();

  source.connect(lp);
  lp.connect(gain);
  source.start();
  return [source, lp, lfo, lfoGain];
}

function createForest(ctx: AudioContext, gain: GainNode): AudioNode[] {
  // Pink noise (filtered) + chirp oscillators
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2000;
  bp.Q.value = 0.5;
  source.connect(bp);
  bp.connect(gain);
  source.start();
  return [source, bp];
}

function createFireplace(ctx: AudioContext, gain: GainNode): AudioNode[] {
  // Crackling: brown noise with bandpass + random crackle bursts
  const bufferSize = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    // Add random crackle spikes
    const crackle = Math.random() > 0.997 ? (Math.random() * 0.8 - 0.4) : 0;
    data[i] = last * 2.5 + crackle;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 600;
  bp.Q.value = 1.2;
  source.connect(bp);
  bp.connect(gain);
  source.start();
  return [source, bp];
}

function createDrone(ctx: AudioContext, gain: GainNode, baseFreq: number, label: string): AudioNode[] {
  // Warm pad: two detuned oscillators + slow vibrato
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = baseFreq;

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = baseFreq * 1.502; // fifth

  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = baseFreq * 2.0; // octave

  const mixGain = ctx.createGain();
  mixGain.gain.value = 0.3;

  // Slow vibrato
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 2;
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  osc1.connect(mixGain);
  osc2.connect(mixGain);
  osc3.connect(mixGain);
  mixGain.connect(gain);

  osc1.start();
  osc2.start();
  osc3.start();
  lfo.start();

  return [osc1, osc2, osc3, lfo, lfoGain, mixGain];
}

function createPianoAmbient(ctx: AudioContext, gain: GainNode): AudioNode[] {
  return createDrone(ctx, gain, 130.81, "piano"); // C3
}

function createJazzAmbient(ctx: AudioContext, gain: GainNode): AudioNode[] {
  return createDrone(ctx, gain, 174.61, "jazz"); // F3 jazz feel
}

function createLofiDrone(ctx: AudioContext, gain: GainNode): AudioNode[] {
  // Lo-fi: warm filtered drone + subtle noise
  const nodes = createDrone(ctx, gain, 98.0, "lofi"); // G2
  // Add subtle filtered noise
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.03;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 300;
  noise.connect(lp);
  lp.connect(gain);
  noise.start();
  return [...nodes, noise, lp];
}

const AMBIENT_TRACKS: AmbientTrack[] = [
  { id: "rain", label: "Rainfall", emoji: "🌧️", generator: createBrownNoise, category: "nature" },
  { id: "forest", label: "Forest", emoji: "🌲", generator: createForest, category: "nature" },
  { id: "ocean", label: "Ocean Waves", emoji: "🌊", generator: createOceanWaves, category: "nature" },
  { id: "fireplace", label: "Fireplace", emoji: "🔥", generator: createFireplace, category: "ambient" },
  { id: "lofi", label: "Lo-Fi Beats", emoji: "🎵", generator: createLofiDrone, category: "music" },
  { id: "piano", label: "Soft Piano", emoji: "🎹", generator: createPianoAmbient, category: "music" },
  { id: "jazz", label: "Jazz Café", emoji: "🎷", generator: createJazzAmbient, category: "music" },
  { id: "whitenoise", label: "White Noise", emoji: "📻", generator: createWhiteNoise, category: "ambient" },
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
  const prevVolumeRef = useRef(30);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);

  const getOrCreateCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.gain.value = (isMuted ? 0 : volume) / 100;
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = gain;
    }
    return { ctx: audioCtxRef.current, gain: gainRef.current! };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllNodes();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = (isMuted ? 0 : volume) / 100;
    }
  }, [volume, isMuted]);

  const stopAllNodes = useCallback(() => {
    nodesRef.current.forEach((node) => {
      try {
        if (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) {
          node.stop();
        }
        node.disconnect();
      } catch {}
    });
    nodesRef.current = [];
  }, []);

  const selectTrack = useCallback((track: AmbientTrack) => {
    if (activeTrackId === track.id && isPlaying) {
      // Pause: suspend audio context
      audioCtxRef.current?.suspend();
      setIsPlaying(false);
      return;
    }

    if (activeTrackId === track.id && !isPlaying) {
      // Resume
      audioCtxRef.current?.resume();
      setIsPlaying(true);
      return;
    }

    // Switch track
    stopAllNodes();
    const { ctx, gain } = getOrCreateCtx();
    gain.gain.value = (isMuted ? 0 : volume) / 100;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const nodes = track.generator(ctx, gain);
    nodesRef.current = nodes;
    setActiveTrackId(track.id);
    setIsPlaying(true);
  }, [activeTrackId, isPlaying, stopAllNodes, getOrCreateCtx, isMuted, volume]);

  const stopMusic = useCallback(() => {
    stopAllNodes();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    gainRef.current = null;
    setActiveTrackId(null);
    setIsPlaying(false);
  }, [stopAllNodes]);

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

        {/* Controls */}
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
