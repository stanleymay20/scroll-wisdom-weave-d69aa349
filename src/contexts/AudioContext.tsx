/**
 * Global Audio Context
 * 
 * Provides route-safe audio state that survives navigation.
 * The TTSMiniPlayer reads from this context to restore playback
 * when returning to the Reader page.
 * 
 * STATUS:
 * - ✅ IMPLEMENTED: Persisted playback state across route changes
 * - ✅ IMPLEMENTED: Chapter/book tracking, voice, chunk position
 * - 🔮 FUTURE: Global floating mini-player rendered at App level
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { audioPositionManager } from "@/lib/audioPositionPersistence";

interface AudioState {
  /** Currently playing book ID */
  bookId: string | null;
  /** Currently playing chapter ID */
  chapterId: string | null;
  /** Selected TTS voice */
  voice: string;
  /** Last known chunk index */
  chunkIndex: number;
  /** Whether audio was playing when user navigated away */
  wasPlaying: boolean;
  /** Chapter text for potential resume */
  chapterTitle: string | null;
}

interface AudioContextValue {
  /** Current global audio state */
  audioState: AudioState;
  /** Save audio state when navigating away from reader */
  saveAudioState: (state: Partial<AudioState>) => void;
  /** Clear audio state (on explicit stop or book change) */
  clearAudioState: () => void;
  /** Check if there's a resumable session for a given book/chapter */
  hasResumableSession: (bookId: string, chapterId: string) => boolean;
}

const defaultState: AudioState = {
  bookId: null,
  chapterId: null,
  voice: "alloy",
  chunkIndex: 0,
  wasPlaying: false,
  chapterTitle: null,
};

const AudioCtx = createContext<AudioContextValue>({
  audioState: defaultState,
  saveAudioState: () => {},
  clearAudioState: () => {},
  hasResumableSession: () => false,
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const [audioState, setAudioState] = useState<AudioState>(defaultState);
  const stateRef = useRef(audioState);
  stateRef.current = audioState;

  const saveAudioState = useCallback((partial: Partial<AudioState>) => {
    setAudioState(prev => {
      const next = { ...prev, ...partial };
      // Also persist to localStorage for cross-session resume
      if (next.bookId && next.chapterId && next.chunkIndex > 0) {
        audioPositionManager.savePosition(
          next.bookId, next.chapterId, next.chunkIndex, 
          0, next.voice
        );
      }
      return next;
    });
  }, []);

  const clearAudioState = useCallback(() => {
    setAudioState(defaultState);
  }, []);

  const hasResumableSession = useCallback((bookId: string, chapterId: string) => {
    // Check in-memory state first
    if (stateRef.current.bookId === bookId && stateRef.current.chapterId === chapterId && stateRef.current.chunkIndex > 0) {
      return true;
    }
    // Fall back to localStorage persistence
    return audioPositionManager.hasPosition(bookId, chapterId);
  }, []);

  return (
    <AudioCtx.Provider value={{ audioState, saveAudioState, clearAudioState, hasResumableSession }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useGlobalAudio() {
  return useContext(AudioCtx);
}
