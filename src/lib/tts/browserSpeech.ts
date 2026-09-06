/**
 * Browser (device) SpeechSynthesis engine.
 *
 * Used as a genuine fallback when the premium TTS provider returns
 * `{ fallback: true }` (quota exhausted / provider down) so narration keeps
 * working instead of throwing an unrecovered error.
 */

export interface SpeakChunkOptions {
  text: string;
  lang?: string;
  /** 0..1 */
  volume?: number;
  /** 0.5..2 playback rate */
  rate?: number;
  /** Polled to support pause/stop/navigation cancellation */
  isCancelled?: () => boolean;
  /** Fired once speech actually starts */
  onStart?: () => void;
  /** Fired with 0..100 progress within this chunk */
  onProgress?: (percent: number) => void;
}

const CANCEL_POLL_MS = 150;
const START_EVENT_FALLBACK_MS = 300;

export function isBrowserSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function cancelBrowserSpeech(): void {
  if (!isBrowserSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* noop */
  }
}

/** Rough duration estimate (seconds) used for progress + elapsed time. */
export function estimateSpeechSeconds(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.7 * (rate || 1);
  return words > 0 ? words / wordsPerSecond : 0;
}

/**
 * Speak a single chunk. Resolves `true` when the chunk finished (or was
 * cancelled cleanly), `false` when speech is unsupported or errored.
 */
export function speakChunk(options: SpeakChunkOptions): Promise<boolean> {
  const { text, lang = "en-US", volume = 1, rate = 1, isCancelled, onStart, onProgress } = options;

  if (!isBrowserSpeechSupported()) return Promise.resolve(false);
  if (!text || !text.trim()) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let started = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let progressId: ReturnType<typeof setInterval> | null = null;
    let startFallbackId: ReturnType<typeof setTimeout> | null = null;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (pollId) clearInterval(pollId);
      if (progressId) clearInterval(progressId);
      if (startFallbackId) clearTimeout(startFallbackId);
      resolve(value);
    };

    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.volume = Math.min(1, Math.max(0, volume));
      utterance.rate = Math.min(2, Math.max(0.5, rate));
      utterance.pitch = 1;

      const estimatedMs = Math.max(500, estimateSpeechSeconds(text, rate) * 1000);

      const markStarted = () => {
        if (started || settled) return;
        started = true;
        const startedAt = Date.now();
        onStart?.();
        if (onProgress) {
          progressId = setInterval(() => {
            const pct = Math.min(99, ((Date.now() - startedAt) / estimatedMs) * 100);
            onProgress(pct);
          }, 250);
        }
      };

      utterance.onstart = markStarted;

      utterance.onend = () => {
        markStarted();
        onProgress?.(100);
        finish(true);
      };

      utterance.onerror = () => {
        finish(isCancelled?.() === true);
      };

      if (isCancelled) {
        pollId = setInterval(() => {
          if (isCancelled()) {
            try {
              synth.cancel();
            } catch {
              /* noop */
            }
            finish(true);
          }
        }, CANCEL_POLL_MS);
      }

      synth.speak(utterance);

      // Some browsers never emit `start`. Invoke the same idempotent start path
      // after a short grace period so UI state/progress cannot remain stuck.
      startFallbackId = setTimeout(markStarted, START_EVENT_FALLBACK_MS);
    } catch {
      finish(false);
    }
  });
}
