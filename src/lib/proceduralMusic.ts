/**
 * Procedural Music Engine v2 — World-Class Web Audio API
 * Generates concert-hall quality musical patterns: lush pads, expressive arpeggios,
 * walking bass, ambient textures, and shimmering harmonics.
 * Used as fallback when ElevenLabs Music API is unavailable.
 */

// ─── Musical Theory ───────────────────────────────────────

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  wholeNote: [0, 2, 4, 6, 8, 10],
};

// Chord voicings with extensions (9ths, 11ths, 13ths)
const PROGRESSIONS = {
  // I-IV-V-I with added 7ths and 9ths
  classical: [
    [0, 4, 7, 11, 14],
    [5, 9, 12, 16],
    [7, 11, 14, 17],
    [0, 4, 7, 11],
  ],
  // i-iv-III-VII with rich minor extensions
  emotional: [
    [0, 3, 7, 10, 14],
    [5, 8, 12, 15],
    [3, 7, 10, 14],
    [7, 10, 14, 17],
  ],
  // Lush Maj9 / min9 movement
  ambient: [
    [0, 4, 7, 11, 14],
    [2, 5, 9, 12, 16],
    [4, 7, 11, 14, 18],
    [0, 4, 7, 11, 14],
  ],
  // ii7-V7-Imaj7-vi9
  jazz: [
    [0, 3, 7, 10, 14],
    [5, 9, 12, 16, 19],
    [7, 11, 14, 18],
    [0, 4, 7, 11, 14],
  ],
  // min7-iv7-bIII7-bVII9
  lofi: [
    [0, 3, 7, 10, 14],
    [5, 8, 12, 15, 19],
    [3, 7, 10, 14, 17],
    [7, 10, 14, 17, 21],
  ],
  // Imaj9-iii7-vi9-IV
  dreamy: [
    [0, 4, 7, 11, 14],
    [4, 7, 11, 14],
    [9, 12, 16, 19],
    [5, 9, 12, 16],
  ],
  // Cinematic tension-release: i-bVI-bIII-bVII
  cinematic: [
    [0, 3, 7, 10],
    [8, 12, 15, 19],
    [3, 7, 10, 14],
    [10, 14, 17, 21],
  ],
};

interface TrackConfig {
  key: number;
  scale: number[];
  progression: number[][];
  tempo: number;
  padVolume: number;
  arpeggioVolume: number;
  bassVolume: number;
  melodyVolume: number;
  shimmerVolume: number;
  reverbDecay: number;
  reverbMix: number;
  waveform: OscillatorType;
  padWaveform: OscillatorType;
  useNoise: boolean;
  noiseVolume: number;
  noiseFilterFreq: number;
  arpeggioPattern: "up" | "down" | "updown" | "random" | "cascade";
  swingAmount: number;
  detuneSpread: number;
  useMelody: boolean;
  useShimmer: boolean;
  chorusDepth: number;
  stereoWidth: number;
  filterCutoff: number;
  filterResonance: number;
  attackTime: number;
  releaseTime: number;
}

const TRACK_CONFIGS: Record<string, TrackConfig> = {
  "beethoven-moonlight": {
    key: 49,
    scale: SCALES.harmonicMinor,
    progression: PROGRESSIONS.emotional,
    tempo: 54,
    padVolume: 0.1,
    arpeggioVolume: 0.16,
    bassVolume: 0.07,
    melodyVolume: 0.12,
    shimmerVolume: 0.03,
    reverbDecay: 5,
    reverbMix: 0.55,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 400,
    arpeggioPattern: "up",
    swingAmount: 0.02,
    detuneSpread: 6,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 3,
    stereoWidth: 0.6,
    filterCutoff: 2000,
    filterResonance: 0.7,
    attackTime: 0.08,
    releaseTime: 0.4,
  },
  "bach-cello-suite": {
    key: 55,
    scale: SCALES.major,
    progression: PROGRESSIONS.classical,
    tempo: 70,
    padVolume: 0.04,
    arpeggioVolume: 0.2,
    bassVolume: 0.11,
    melodyVolume: 0.08,
    shimmerVolume: 0.02,
    reverbDecay: 3.5,
    reverbMix: 0.4,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 600,
    arpeggioPattern: "updown",
    swingAmount: 0,
    detuneSpread: 4,
    useMelody: true,
    useShimmer: false,
    chorusDepth: 2,
    stereoWidth: 0.4,
    filterCutoff: 3000,
    filterResonance: 0.5,
    attackTime: 0.02,
    releaseTime: 0.3,
  },
  "debussy-clair-de-lune": {
    key: 53,
    scale: SCALES.lydian,
    progression: PROGRESSIONS.dreamy,
    tempo: 50,
    padVolume: 0.12,
    arpeggioVolume: 0.14,
    bassVolume: 0.05,
    melodyVolume: 0.13,
    shimmerVolume: 0.06,
    reverbDecay: 6,
    reverbMix: 0.65,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 500,
    arpeggioPattern: "cascade",
    swingAmount: 0.06,
    detuneSpread: 8,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 5,
    stereoWidth: 0.8,
    filterCutoff: 1800,
    filterResonance: 0.8,
    attackTime: 0.12,
    releaseTime: 0.6,
  },
  "symphony-adagio": {
    key: 48,
    scale: SCALES.minor,
    progression: PROGRESSIONS.cinematic,
    tempo: 42,
    padVolume: 0.18,
    arpeggioVolume: 0.05,
    bassVolume: 0.1,
    melodyVolume: 0.1,
    shimmerVolume: 0.04,
    reverbDecay: 7,
    reverbMix: 0.6,
    waveform: "triangle",
    padWaveform: "sawtooth",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 300,
    arpeggioPattern: "up",
    swingAmount: 0,
    detuneSpread: 10,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 6,
    stereoWidth: 0.9,
    filterCutoff: 1200,
    filterResonance: 0.6,
    attackTime: 0.2,
    releaseTime: 0.8,
  },
  "vivaldi-seasons": {
    key: 55,
    scale: SCALES.major,
    progression: PROGRESSIONS.classical,
    tempo: 92,
    padVolume: 0.06,
    arpeggioVolume: 0.18,
    bassVolume: 0.1,
    melodyVolume: 0.14,
    shimmerVolume: 0.02,
    reverbDecay: 2.8,
    reverbMix: 0.35,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 800,
    arpeggioPattern: "updown",
    swingAmount: 0,
    detuneSpread: 4,
    useMelody: true,
    useShimmer: false,
    chorusDepth: 2,
    stereoWidth: 0.5,
    filterCutoff: 4000,
    filterResonance: 0.4,
    attackTime: 0.01,
    releaseTime: 0.2,
  },
  "chopin-nocturne": {
    key: 52,
    scale: SCALES.harmonicMinor,
    progression: PROGRESSIONS.emotional,
    tempo: 58,
    padVolume: 0.08,
    arpeggioVolume: 0.18,
    bassVolume: 0.05,
    melodyVolume: 0.15,
    shimmerVolume: 0.04,
    reverbDecay: 5,
    reverbMix: 0.55,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    noiseFilterFreq: 400,
    arpeggioPattern: "up",
    swingAmount: 0.1,
    detuneSpread: 6,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 4,
    stereoWidth: 0.7,
    filterCutoff: 2200,
    filterResonance: 0.7,
    attackTime: 0.06,
    releaseTime: 0.5,
  },
  "ambient-focus": {
    key: 48,
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.ambient,
    tempo: 38,
    padVolume: 0.18,
    arpeggioVolume: 0.04,
    bassVolume: 0.06,
    melodyVolume: 0.06,
    shimmerVolume: 0.08,
    reverbDecay: 8,
    reverbMix: 0.75,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.025,
    noiseFilterFreq: 600,
    arpeggioPattern: "random",
    swingAmount: 0,
    detuneSpread: 12,
    useMelody: false,
    useShimmer: true,
    chorusDepth: 8,
    stereoWidth: 1.0,
    filterCutoff: 1000,
    filterResonance: 0.9,
    attackTime: 0.3,
    releaseTime: 1.0,
  },
  "lofi-study": {
    key: 50,
    scale: SCALES.dorian,
    progression: PROGRESSIONS.lofi,
    tempo: 72,
    padVolume: 0.08,
    arpeggioVolume: 0.13,
    bassVolume: 0.11,
    melodyVolume: 0.1,
    shimmerVolume: 0.02,
    reverbDecay: 2.5,
    reverbMix: 0.35,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.02,
    noiseFilterFreq: 900,
    arpeggioPattern: "random",
    swingAmount: 0.14,
    detuneSpread: 5,
    useMelody: true,
    useShimmer: false,
    chorusDepth: 3,
    stereoWidth: 0.5,
    filterCutoff: 2500,
    filterResonance: 0.6,
    attackTime: 0.03,
    releaseTime: 0.25,
  },
  "jazz-cafe": {
    key: 53,
    scale: SCALES.dorian,
    progression: PROGRESSIONS.jazz,
    tempo: 105,
    padVolume: 0.06,
    arpeggioVolume: 0.12,
    bassVolume: 0.13,
    melodyVolume: 0.11,
    shimmerVolume: 0.02,
    reverbDecay: 2.2,
    reverbMix: 0.3,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.012,
    noiseFilterFreq: 1200,
    arpeggioPattern: "random",
    swingAmount: 0.18,
    detuneSpread: 4,
    useMelody: true,
    useShimmer: false,
    chorusDepth: 2,
    stereoWidth: 0.6,
    filterCutoff: 3500,
    filterResonance: 0.5,
    attackTime: 0.01,
    releaseTime: 0.15,
  },
  "spa-meditation": {
    key: 48,
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.ambient,
    tempo: 32,
    padVolume: 0.16,
    arpeggioVolume: 0.06,
    bassVolume: 0.03,
    melodyVolume: 0.05,
    shimmerVolume: 0.1,
    reverbDecay: 9,
    reverbMix: 0.8,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.02,
    noiseFilterFreq: 400,
    arpeggioPattern: "up",
    swingAmount: 0,
    detuneSpread: 15,
    useMelody: false,
    useShimmer: true,
    chorusDepth: 10,
    stereoWidth: 1.0,
    filterCutoff: 800,
    filterResonance: 1.0,
    attackTime: 0.5,
    releaseTime: 1.5,
  },
  "rain-piano": {
    key: 50,
    scale: SCALES.minor,
    progression: PROGRESSIONS.emotional,
    tempo: 56,
    padVolume: 0.06,
    arpeggioVolume: 0.16,
    bassVolume: 0.05,
    melodyVolume: 0.14,
    shimmerVolume: 0.03,
    reverbDecay: 4.5,
    reverbMix: 0.5,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.05,
    noiseFilterFreq: 700,
    arpeggioPattern: "up",
    swingAmount: 0.05,
    detuneSpread: 6,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 4,
    stereoWidth: 0.7,
    filterCutoff: 2000,
    filterResonance: 0.7,
    attackTime: 0.06,
    releaseTime: 0.4,
  },
  "forest-morning": {
    key: 55,
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.dreamy,
    tempo: 60,
    padVolume: 0.1,
    arpeggioVolume: 0.12,
    bassVolume: 0.05,
    melodyVolume: 0.1,
    shimmerVolume: 0.06,
    reverbDecay: 4,
    reverbMix: 0.5,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.035,
    noiseFilterFreq: 500,
    arpeggioPattern: "cascade",
    swingAmount: 0,
    detuneSpread: 8,
    useMelody: true,
    useShimmer: true,
    chorusDepth: 5,
    stereoWidth: 0.8,
    filterCutoff: 1500,
    filterResonance: 0.8,
    attackTime: 0.1,
    releaseTime: 0.5,
  },
};

// ─── Audio Utilities ──────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Create a lush, concert-hall quality impulse response */
function createReverb(ctx: AudioContext, decay: number): ConvolverNode {
  const convolver = ctx.createConvolver();
  const rate = ctx.sampleRate;
  const length = rate * decay;
  const impulse = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Multi-stage decay for natural hall sound
      const earlyReflection = t < 0.02 ? Math.random() * 0.8 : 0;
      const mainDecay = Math.pow(1 - t, decay * 0.4);
      const lateReverb = Math.exp(-3 * t) * 0.3;
      // Slight stereo decorrelation per channel
      const offset = ch === 0 ? 0 : 0.003;
      const tOffset = Math.max(0, t - offset);
      data[i] =
        (Math.random() * 2 - 1) *
        (earlyReflection + mainDecay * 0.7 + lateReverb) *
        (ch === 0 ? 1 : Math.pow(1 - tOffset, decay * 0.4));
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

/** Brown noise generator — warm, natural texture */
function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      // Subtle stereo variation
      data[i] = lastOut * 3.5 * (1 + (ch === 1 ? Math.sin(i / 8000) * 0.1 : 0));
    }
  }
  return buffer;
}

// ─── Engine Core ──────────────────────────────────────────

export interface ProceduralMusicSession {
  stop: () => void;
  setVolume: (v: number) => void;
  isPlaying: () => boolean;
}

export function startProceduralMusic(
  trackId: string,
  volume: number = 0.4
): ProceduralMusicSession {
  const config = TRACK_CONFIGS[trackId];
  if (!config) {
    throw new Error(`Unknown track: ${trackId}`);
  }

  const ctx = new AudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;

  // ── Signal chain ──
  const reverb = createReverb(ctx, config.reverbDecay);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = config.reverbMix;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - config.reverbMix * 0.5;

  // Master filter for warmth
  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = "lowpass";
  masterFilter.frequency.value = config.filterCutoff;
  masterFilter.Q.value = config.filterResonance;

  // Compressor for glue
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 20;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.15;

  // Stereo widener via slight delay
  const stereoDelay = ctx.createDelay(0.03);
  stereoDelay.delayTime.value = 0.012;
  const stereoGain = ctx.createGain();
  stereoGain.gain.value = config.stereoWidth * 0.3;

  // Routing
  reverb.connect(reverbGain);
  reverbGain.connect(masterFilter);
  dryGain.connect(masterFilter);
  masterFilter.connect(compressor);

  // Stereo widening path
  masterFilter.connect(stereoDelay);
  stereoDelay.connect(stereoGain);
  stereoGain.connect(compressor);

  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  let stopped = false;
  const activeOscs: OscillatorNode[] = [];
  const activeSources: AudioBufferSourceNode[] = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  function scheduleTimeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    timeouts.push(id);
    return id;
  }

  // ── Chord note calculation ──
  function getChordFreqs(chordDegrees: number[], octaveOffset = 0): number[] {
    return chordDegrees.map((degree) => {
      const octaveShift = Math.floor(degree / config.scale.length);
      const scaleIdx =
        ((degree % config.scale.length) + config.scale.length) %
        config.scale.length;
      const midi =
        config.key + config.scale[scaleIdx] + octaveShift * 12 + octaveOffset * 12;
      return midiToFreq(midi);
    });
  }

  // ── LAYER 1: Lush Pad with Chorus ──
  function playPad() {
    if (stopped) return;
    const beatDur = 60 / config.tempo;
    const chordDur = beatDur * 4;

    config.progression.forEach((chord, idx) => {
      if (stopped) return;
      const freqs = getChordFreqs(chord);
      const startTime = ctx.currentTime + idx * chordDur;

      freqs.forEach((freq, fi) => {
        // Create 2 detuned oscillators per note for chorus effect
        for (let layer = 0; layer < 2; layer++) {
          const osc = ctx.createOscillator();
          osc.type = config.padWaveform;
          osc.frequency.value = freq;
          osc.detune.value =
            (layer === 0 ? -1 : 1) * config.chorusDepth +
            (Math.random() - 0.5) * config.detuneSpread;

          const env = ctx.createGain();
          const vol = config.padVolume * 0.5; // Half per layer
          env.gain.setValueAtTime(0, startTime);
          env.gain.linearRampToValueAtTime(vol, startTime + chordDur * 0.25);
          env.gain.setValueAtTime(vol, startTime + chordDur * 0.7);
          env.gain.linearRampToValueAtTime(0, startTime + chordDur + 0.05);

          // Gentle LFO vibrato
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.3 + fi * 0.1;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 1.5;
          lfo.connect(lfoGain);
          lfoGain.connect(osc.detune);

          osc.connect(env);
          env.connect(reverb);
          env.connect(dryGain);

          osc.start(startTime);
          osc.stop(startTime + chordDur + 0.2);
          lfo.start(startTime);
          lfo.stop(startTime + chordDur + 0.2);
          activeOscs.push(osc, lfo);
        }
      });
    });

    const totalDur = config.progression.length * chordDur;
    scheduleTimeout(() => !stopped && playPad(), totalDur * 1000 - 300);
  }

  // ── LAYER 2: Expressive Arpeggio ──
  function playArpeggio() {
    if (stopped) return;
    const beatDur = 60 / config.tempo;
    const noteDur = beatDur / 2;
    const chordDur = beatDur * 4;

    config.progression.forEach((chord, chordIdx) => {
      if (stopped) return;
      const freqs = getChordFreqs(chord, 1);

      let noteOrder: number[];
      const len = freqs.length;
      switch (config.arpeggioPattern) {
        case "down":
          noteOrder = [...Array(len).keys()].reverse();
          break;
        case "updown": {
          const up = [...Array(len).keys()];
          noteOrder = [...up, ...up.slice(1, -1).reverse()];
          break;
        }
        case "cascade": {
          // Waterfall pattern: play groups with overlap
          noteOrder = [];
          for (let g = 0; g < len; g++) {
            for (let n = 0; n <= g && n < len; n++) {
              noteOrder.push(n);
            }
          }
          break;
        }
        case "random":
          noteOrder = Array.from(
            { length: 8 },
            () => Math.floor(Math.random() * len)
          );
          break;
        default:
          noteOrder = [...Array(len).keys()];
      }

      const notesPerBar = Math.floor(chordDur / noteDur);
      for (let i = 0; i < notesPerBar; i++) {
        if (stopped) return;
        const freqIdx = noteOrder[i % noteOrder.length];
        const freq = freqs[freqIdx];

        // Humanized swing timing
        const swing = i % 2 === 1 ? config.swingAmount * noteDur : 0;
        const humanize = (Math.random() - 0.5) * 0.015;
        const startTime =
          ctx.currentTime +
          chordIdx * chordDur +
          i * noteDur +
          swing +
          humanize;

        const osc = ctx.createOscillator();
        osc.type = config.waveform;
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * config.detuneSpread;

        const env = ctx.createGain();
        // Humanized velocity
        const velocity = 0.6 + Math.random() * 0.4;
        const vol = config.arpeggioVolume * velocity;
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(vol, startTime + config.attackTime);
        env.gain.exponentialRampToValueAtTime(
          0.001,
          startTime + noteDur * 1.8 + config.releaseTime
        );

        osc.connect(env);
        env.connect(reverb);
        env.connect(dryGain);

        osc.start(startTime);
        osc.stop(startTime + noteDur * 2 + config.releaseTime + 0.1);
        activeOscs.push(osc);
      }
    });

    const totalDur = config.progression.length * chordDur;
    scheduleTimeout(() => !stopped && playArpeggio(), totalDur * 1000 - 300);
  }

  // ── LAYER 3: Walking Bass ──
  function playBass() {
    if (stopped) return;
    const beatDur = 60 / config.tempo;
    const chordDur = beatDur * 4;

    config.progression.forEach((chord, idx) => {
      if (stopped) return;
      const rootDegree = chord[0];
      const octaveShift = Math.floor(rootDegree / config.scale.length);
      const scaleIdx =
        ((rootDegree % config.scale.length) + config.scale.length) %
        config.scale.length;
      const bassMidi = config.key - 12 + config.scale[scaleIdx] + octaveShift * 12;
      const freq = midiToFreq(bassMidi);

      const startTime = ctx.currentTime + idx * chordDur;

      // Main bass
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      // Sub bass (one octave lower)
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = freq / 2;

      // Fifth harmonic for warmth
      const fifth = ctx.createOscillator();
      fifth.type = "sine";
      fifth.frequency.value = freq * 1.5;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(config.bassVolume, startTime + 0.08);
      env.gain.setValueAtTime(config.bassVolume * 0.85, startTime + chordDur * 0.5);
      env.gain.linearRampToValueAtTime(0, startTime + chordDur);

      const subEnv = ctx.createGain();
      subEnv.gain.setValueAtTime(0, startTime);
      subEnv.gain.linearRampToValueAtTime(
        config.bassVolume * 0.25,
        startTime + 0.1
      );
      subEnv.gain.linearRampToValueAtTime(0, startTime + chordDur);

      const fifthEnv = ctx.createGain();
      fifthEnv.gain.setValueAtTime(0, startTime);
      fifthEnv.gain.linearRampToValueAtTime(
        config.bassVolume * 0.08,
        startTime + 0.1
      );
      fifthEnv.gain.linearRampToValueAtTime(0, startTime + chordDur);

      osc.connect(env);
      sub.connect(subEnv);
      fifth.connect(fifthEnv);
      env.connect(dryGain);
      subEnv.connect(dryGain);
      fifthEnv.connect(dryGain);
      // Send a touch to reverb
      env.connect(reverb);

      [osc, sub, fifth].forEach((o) => {
        o.start(startTime);
        o.stop(startTime + chordDur + 0.1);
        activeOscs.push(o);
      });
    });

    const totalDur = config.progression.length * chordDur;
    scheduleTimeout(() => !stopped && playBass(), totalDur * 1000 - 300);
  }

  // ── LAYER 4: Melody (pentatonic improvisation) ──
  function playMelody() {
    if (stopped || !config.useMelody) return;
    const beatDur = 60 / config.tempo;
    const chordDur = beatDur * 4;

    config.progression.forEach((chord, chordIdx) => {
      if (stopped) return;
      const chordFreqs = getChordFreqs(chord, 2);
      const startBase = ctx.currentTime + chordIdx * chordDur;

      // Play 2-4 melody notes per chord, sparsely
      const noteCount = 2 + Math.floor(Math.random() * 3);
      for (let n = 0; n < noteCount; n++) {
        if (stopped) return;
        const noteStart = startBase + (n / noteCount) * chordDur + (Math.random() - 0.5) * beatDur * 0.3;
        const freq = chordFreqs[Math.floor(Math.random() * chordFreqs.length)];
        const dur = beatDur * (0.5 + Math.random() * 1.5);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 4;

        // Gentle vibrato
        const vib = ctx.createOscillator();
        vib.frequency.value = 4 + Math.random() * 2;
        const vibGain = ctx.createGain();
        vibGain.gain.value = 3;
        vib.connect(vibGain);
        vibGain.connect(osc.detune);

        const env = ctx.createGain();
        const vel = 0.5 + Math.random() * 0.5;
        env.gain.setValueAtTime(0, noteStart);
        env.gain.linearRampToValueAtTime(
          config.melodyVolume * vel,
          noteStart + config.attackTime * 0.5
        );
        env.gain.setValueAtTime(
          config.melodyVolume * vel * 0.7,
          noteStart + dur * 0.6
        );
        env.gain.exponentialRampToValueAtTime(0.001, noteStart + dur);

        osc.connect(env);
        env.connect(reverb);
        env.connect(dryGain);

        osc.start(noteStart);
        osc.stop(noteStart + dur + 0.1);
        vib.start(noteStart);
        vib.stop(noteStart + dur + 0.1);
        activeOscs.push(osc, vib);
      }
    });

    const totalDur = config.progression.length * chordDur;
    scheduleTimeout(() => !stopped && playMelody(), totalDur * 1000 - 300);
  }

  // ── LAYER 5: Shimmer / Harmonics ──
  function playShimmer() {
    if (stopped || !config.useShimmer) return;
    const beatDur = 60 / config.tempo;
    const chordDur = beatDur * 4;
    const totalDur = config.progression.length * chordDur;

    // Occasional high sparkle notes
    const noteCount = 3 + Math.floor(Math.random() * 4);
    for (let n = 0; n < noteCount; n++) {
      if (stopped) return;
      const noteStart = ctx.currentTime + Math.random() * totalDur;
      // Very high register
      const scaleNote = config.scale[Math.floor(Math.random() * config.scale.length)];
      const freq = midiToFreq(config.key + 36 + scaleNote); // 3 octaves up

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, noteStart);
      env.gain.linearRampToValueAtTime(config.shimmerVolume, noteStart + 0.3);
      env.gain.exponentialRampToValueAtTime(0.001, noteStart + 2 + Math.random() * 2);

      osc.connect(env);
      env.connect(reverb);

      osc.start(noteStart);
      osc.stop(noteStart + 5);
      activeOscs.push(osc);
    }

    scheduleTimeout(() => !stopped && playShimmer(), totalDur * 1000 - 300);
  }

  // ── LAYER 6: Noise / Texture ──
  function playNoise() {
    if (stopped || !config.useNoise) return;
    const buffer = createNoiseBuffer(ctx, 20);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = config.noiseFilterFreq;
    filter.Q.value = 0.3;

    // Gentle modulation of filter
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = config.noiseFilterFreq * 0.3;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = config.noiseVolume;

    source.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(reverb);
    noiseGain.connect(dryGain);

    source.start();
    lfo.start();
    activeSources.push(source);
    activeOscs.push(lfo);
  }

  // ── Start all layers ──
  playPad();
  playArpeggio();
  playBass();
  playMelody();
  playShimmer();
  playNoise();

  return {
    stop: () => {
      stopped = true;
      // Graceful fade out
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      timeouts.forEach(clearTimeout);
      setTimeout(() => {
        activeOscs.forEach((o) => {
          try { o.stop(); } catch {}
        });
        activeSources.forEach((s) => {
          try { s.stop(); } catch {}
        });
        ctx.close().catch(() => {});
      }, 900);
    },
    setVolume: (v: number) => {
      masterGain.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.1);
    },
    isPlaying: () => !stopped,
  };
}

export function getAvailableTrackIds(): string[] {
  return Object.keys(TRACK_CONFIGS);
}
