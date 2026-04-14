/**
 * Procedural Music Engine — Web Audio API
 * Generates real musical patterns: chords, arpeggios, pads, and ambient textures.
 * Used as fallback when ElevenLabs Music API is unavailable.
 */

// Musical scales and chord progressions
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

// Common chord progressions (scale degree offsets)
const PROGRESSIONS = {
  classical: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],       // I-IV-V-I
  emotional: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]],       // i-iv-III-VII
  ambient: [[0, 4, 7, 11], [2, 5, 9, 12], [4, 7, 11, 14], [0, 4, 7, 11]], // Maj7 movement
  jazz: [[0, 4, 7, 10], [5, 9, 12, 15], [7, 11, 14, 17], [0, 3, 7, 10]], // ii-V-I-vi
  lofi: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]], // Minor 7th movement
};

interface TrackConfig {
  key: number;        // MIDI root note (e.g., 60 = C4)
  scale: number[];
  progression: number[][];
  tempo: number;       // BPM
  padVolume: number;
  arpeggioVolume: number;
  bassVolume: number;
  reverbDecay: number;
  waveform: OscillatorType;
  padWaveform: OscillatorType;
  useNoise: boolean;
  noiseVolume: number;
  arpeggioPattern: 'up' | 'down' | 'updown' | 'random';
  swingAmount: number;
}

const TRACK_CONFIGS: Record<string, TrackConfig> = {
  "beethoven-moonlight": {
    key: 49, // C#3
    scale: SCALES.minor,
    progression: PROGRESSIONS.emotional,
    tempo: 56,
    padVolume: 0.12,
    arpeggioVolume: 0.18,
    bassVolume: 0.08,
    reverbDecay: 4,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "up",
    swingAmount: 0,
  },
  "bach-cello-suite": {
    key: 55, // G3
    scale: SCALES.major,
    progression: PROGRESSIONS.classical,
    tempo: 72,
    padVolume: 0.06,
    arpeggioVolume: 0.22,
    bassVolume: 0.12,
    reverbDecay: 3,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "updown",
    swingAmount: 0,
  },
  "debussy-clair-de-lune": {
    key: 53, // F3
    scale: SCALES.major,
    progression: PROGRESSIONS.ambient,
    tempo: 52,
    padVolume: 0.14,
    arpeggioVolume: 0.16,
    bassVolume: 0.06,
    reverbDecay: 5,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "up",
    swingAmount: 0.05,
  },
  "symphony-adagio": {
    key: 48, // C3
    scale: SCALES.minor,
    progression: PROGRESSIONS.emotional,
    tempo: 44,
    padVolume: 0.2,
    arpeggioVolume: 0.06,
    bassVolume: 0.1,
    reverbDecay: 6,
    waveform: "triangle",
    padWaveform: "sawtooth",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "up",
    swingAmount: 0,
  },
  "vivaldi-seasons": {
    key: 55, // G3
    scale: SCALES.major,
    progression: PROGRESSIONS.classical,
    tempo: 96,
    padVolume: 0.08,
    arpeggioVolume: 0.2,
    bassVolume: 0.1,
    reverbDecay: 2.5,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "updown",
    swingAmount: 0,
  },
  "chopin-nocturne": {
    key: 52, // E3
    scale: SCALES.minor,
    progression: PROGRESSIONS.emotional,
    tempo: 60,
    padVolume: 0.1,
    arpeggioVolume: 0.2,
    bassVolume: 0.06,
    reverbDecay: 4.5,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: false,
    noiseVolume: 0,
    arpeggioPattern: "up",
    swingAmount: 0.08,
  },
  "ambient-focus": {
    key: 48, // C3
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.ambient,
    tempo: 40,
    padVolume: 0.2,
    arpeggioVolume: 0.04,
    bassVolume: 0.08,
    reverbDecay: 7,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.03,
    arpeggioPattern: "random",
    swingAmount: 0,
  },
  "lofi-study": {
    key: 50, // D3
    scale: SCALES.dorian,
    progression: PROGRESSIONS.lofi,
    tempo: 75,
    padVolume: 0.1,
    arpeggioVolume: 0.15,
    bassVolume: 0.12,
    reverbDecay: 2,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.02,
    arpeggioPattern: "random",
    swingAmount: 0.12,
  },
  "jazz-cafe": {
    key: 53, // F3
    scale: SCALES.dorian,
    progression: PROGRESSIONS.jazz,
    tempo: 110,
    padVolume: 0.08,
    arpeggioVolume: 0.14,
    bassVolume: 0.14,
    reverbDecay: 2,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.015,
    arpeggioPattern: "random",
    swingAmount: 0.15,
  },
  "spa-meditation": {
    key: 48, // C3
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.ambient,
    tempo: 35,
    padVolume: 0.18,
    arpeggioVolume: 0.08,
    bassVolume: 0.04,
    reverbDecay: 8,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.025,
    arpeggioPattern: "up",
    swingAmount: 0,
  },
  "rain-piano": {
    key: 50, // D3
    scale: SCALES.minor,
    progression: PROGRESSIONS.emotional,
    tempo: 58,
    padVolume: 0.08,
    arpeggioVolume: 0.18,
    bassVolume: 0.06,
    reverbDecay: 4,
    waveform: "sine",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.06,
    arpeggioPattern: "up",
    swingAmount: 0.05,
  },
  "forest-morning": {
    key: 55, // G3
    scale: SCALES.pentatonic,
    progression: PROGRESSIONS.ambient,
    tempo: 65,
    padVolume: 0.12,
    arpeggioVolume: 0.14,
    bassVolume: 0.06,
    reverbDecay: 3.5,
    waveform: "triangle",
    padWaveform: "sine",
    useNoise: true,
    noiseVolume: 0.04,
    arpeggioPattern: "up",
    swingAmount: 0,
  },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createReverb(ctx: AudioContext, decay: number): ConvolverNode {
  const convolver = ctx.createConvolver();
  const rate = ctx.sampleRate;
  const length = rate * decay;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay * 0.5);
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown noise (more natural, less harsh)
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  return buffer;
}

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

  const reverb = createReverb(ctx, config.reverbDecay);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.4;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.7;

  // Compressor for smooth output
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 4;

  reverb.connect(reverbGain);
  reverbGain.connect(compressor);
  dryGain.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  let stopped = false;
  const activeOscs: OscillatorNode[] = [];
  const activeSources: AudioBufferSourceNode[] = [];

  // Get chord notes from scale
  function getChordFreqs(chordDegrees: number[]): number[] {
    return chordDegrees.map((degree) => {
      const octaveShift = Math.floor(degree / config.scale.length);
      const scaleIdx = ((degree % config.scale.length) + config.scale.length) % config.scale.length;
      const midi = config.key + config.scale[scaleIdx] + octaveShift * 12;
      return midiToFreq(midi);
    });
  }

  // ---- PAD LAYER ----
  function playPad() {
    if (stopped) return;
    const beatDuration = 60 / config.tempo;
    const chordDuration = beatDuration * 4; // 1 bar per chord

    config.progression.forEach((chord, idx) => {
      if (stopped) return;
      const freqs = getChordFreqs(chord);
      const startTime = ctx.currentTime + idx * chordDuration;

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = config.padWaveform;
        osc.frequency.value = freq;

        // Slight detune for warmth
        osc.detune.value = (Math.random() - 0.5) * 8;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(config.padVolume, startTime + chordDuration * 0.3);
        env.gain.linearRampToValueAtTime(config.padVolume * 0.8, startTime + chordDuration * 0.8);
        env.gain.linearRampToValueAtTime(0, startTime + chordDuration);

        osc.connect(env);
        env.connect(reverb);
        env.connect(dryGain);

        osc.start(startTime);
        osc.stop(startTime + chordDuration + 0.1);
        activeOscs.push(osc);
      });
    });

    const totalDuration = config.progression.length * chordDuration;
    setTimeout(() => {
      if (!stopped) playPad();
    }, totalDuration * 1000 - 200);
  }

  // ---- ARPEGGIO LAYER ----
  function playArpeggio() {
    if (stopped) return;
    const beatDuration = 60 / config.tempo;
    const noteDuration = beatDuration / 2; // Eighth notes
    const chordDuration = beatDuration * 4;

    config.progression.forEach((chord, chordIdx) => {
      if (stopped) return;
      const freqs = getChordFreqs(chord.map((d) => d + 12)); // One octave up

      let noteOrder: number[];
      switch (config.arpeggioPattern) {
        case "down":
          noteOrder = [...Array(freqs.length).keys()].reverse();
          break;
        case "updown": {
          const up = [...Array(freqs.length).keys()];
          const down = [...up].reverse().slice(1);
          noteOrder = [...up, ...down];
          break;
        }
        case "random":
          noteOrder = Array.from({ length: 8 }, () => Math.floor(Math.random() * freqs.length));
          break;
        default:
          noteOrder = [...Array(freqs.length).keys()];
      }

      const notesPerBar = Math.floor(chordDuration / noteDuration);
      for (let i = 0; i < notesPerBar; i++) {
        if (stopped) return;
        const freqIdx = noteOrder[i % noteOrder.length];
        const freq = freqs[freqIdx];

        const swing = i % 2 === 1 ? config.swingAmount * noteDuration : 0;
        const startTime = ctx.currentTime + chordIdx * chordDuration + i * noteDuration + swing;

        const osc = ctx.createOscillator();
        osc.type = config.waveform;
        osc.frequency.value = freq;

        // Humanize
        osc.detune.value = (Math.random() - 0.5) * 6;

        const env = ctx.createGain();
        const velocity = 0.7 + Math.random() * 0.3;
        const vol = config.arpeggioVolume * velocity;
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(vol, startTime + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 1.5);

        osc.connect(env);
        env.connect(reverb);
        env.connect(dryGain);

        osc.start(startTime);
        osc.stop(startTime + noteDuration * 2);
        activeOscs.push(osc);
      }
    });

    const totalDuration = config.progression.length * chordDuration;
    setTimeout(() => {
      if (!stopped) playArpeggio();
    }, totalDuration * 1000 - 200);
  }

  // ---- BASS LAYER ----
  function playBass() {
    if (stopped) return;
    const beatDuration = 60 / config.tempo;
    const chordDuration = beatDuration * 4;

    config.progression.forEach((chord, idx) => {
      if (stopped) return;
      const rootDegree = chord[0];
      const octaveShift = Math.floor(rootDegree / config.scale.length);
      const scaleIdx = ((rootDegree % config.scale.length) + config.scale.length) % config.scale.length;
      const bassMidi = config.key - 12 + config.scale[scaleIdx] + octaveShift * 12;
      const freq = midiToFreq(bassMidi);

      const startTime = ctx.currentTime + idx * chordDuration;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      // Sub-bass layer
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = freq / 2;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(config.bassVolume, startTime + 0.1);
      env.gain.linearRampToValueAtTime(config.bassVolume * 0.6, startTime + chordDuration * 0.9);
      env.gain.linearRampToValueAtTime(0, startTime + chordDuration);

      const env2 = ctx.createGain();
      env2.gain.setValueAtTime(0, startTime);
      env2.gain.linearRampToValueAtTime(config.bassVolume * 0.3, startTime + 0.1);
      env2.gain.linearRampToValueAtTime(0, startTime + chordDuration);

      osc.connect(env);
      osc2.connect(env2);
      env.connect(dryGain);
      env2.connect(dryGain);

      osc.start(startTime);
      osc.stop(startTime + chordDuration + 0.1);
      osc2.start(startTime);
      osc2.stop(startTime + chordDuration + 0.1);
      activeOscs.push(osc, osc2);
    });

    const totalDuration = config.progression.length * chordDuration;
    setTimeout(() => {
      if (!stopped) playBass();
    }, totalDuration * 1000 - 200);
  }

  // ---- NOISE / TEXTURE LAYER ----
  function playNoise() {
    if (stopped || !config.useNoise) return;
    const duration = 15; // 15s loops
    const buffer = createNoiseBuffer(ctx, duration);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Shape the noise
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = config.noiseVolume;

    source.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(reverb);
    noiseGain.connect(dryGain);

    source.start();
    activeSources.push(source);
  }

  // Start all layers
  playPad();
  playArpeggio();
  playBass();
  playNoise();

  return {
    stop: () => {
      stopped = true;
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      setTimeout(() => {
        activeOscs.forEach((o) => { try { o.stop(); } catch {} });
        activeSources.forEach((s) => { try { s.stop(); } catch {} });
        ctx.close().catch(() => {});
      }, 600);
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
