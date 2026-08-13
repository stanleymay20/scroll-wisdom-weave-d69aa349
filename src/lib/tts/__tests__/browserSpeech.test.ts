import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isBrowserSpeechSupported,
  speakChunk,
  cancelBrowserSpeech,
  estimateSpeechSeconds,
} from "../browserSpeech";

type Utt = {
  text: string;
  lang: string;
  volume: number;
  rate: number;
  pitch: number;
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
};

let spoken: Utt[] = [];
let cancelCalls = 0;
let autoEnd = true;

class FakeUtterance {
  text: string;
  lang = "";
  volume = 1;
  rate = 1;
  pitch = 1;
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeechSynthesis() {
  spoken = [];
  cancelCalls = 0;
  autoEnd = true;
  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  (window as unknown as Record<string, unknown>).speechSynthesis = {
    cancel: () => {
      cancelCalls++;
    },
    speak: (u: Utt) => {
      spoken.push(u);
      u.onstart?.();
      if (autoEnd) setTimeout(() => u.onend?.(), 0);
    },
  };
}

describe("browserSpeech", () => {
  beforeEach(() => {
    installSpeechSynthesis();
  });

  it("reports support when the API exists", () => {
    expect(isBrowserSpeechSupported()).toBe(true);
  });

  it("speaks a chunk and resolves true", async () => {
    const onStart = vi.fn();
    const ok = await speakChunk({ text: "Hello world", onStart });
    expect(ok).toBe(true);
    expect(onStart).toHaveBeenCalled();
    expect(spoken[0].text).toBe("Hello world");
  });

  it("applies volume and clamps rate", async () => {
    await speakChunk({ text: "Test", volume: 0.5, rate: 5 });
    expect(spoken[0].volume).toBe(0.5);
    expect(spoken[0].rate).toBe(2);
  });

  it("resolves true immediately for empty text without speaking", async () => {
    const ok = await speakChunk({ text: "   " });
    expect(ok).toBe(true);
    expect(spoken).toHaveLength(0);
  });

  it("cancels and resolves when isCancelled becomes true", async () => {
    autoEnd = false;
    let cancelled = false;
    const promise = speakChunk({ text: "Long text", isCancelled: () => cancelled });
    cancelled = true;
    await expect(promise).resolves.toBe(true);
    expect(cancelCalls).toBeGreaterThan(1);
  });

  it("resolves false on error when not cancelled", async () => {
    autoEnd = false;
    const promise = speakChunk({ text: "Broken" });
    spoken[0].onerror?.();
    await expect(promise).resolves.toBe(false);
  });

  it("cancelBrowserSpeech calls synthesis cancel", () => {
    cancelBrowserSpeech();
    expect(cancelCalls).toBe(1);
  });

  it("estimates duration from word count", () => {
    expect(estimateSpeechSeconds("one two three", 1)).toBeCloseTo(3 / 2.7, 3);
    expect(estimateSpeechSeconds("", 1)).toBe(0);
  });
});
