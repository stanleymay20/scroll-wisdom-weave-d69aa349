/**
 * Global Audio Context — Route-Safe Audio Engine
 * 
 * Owns the HTMLAudioElement so playback survives route changes.
 * The TTSMiniPlayer in Reader writes chunks to this engine.
 * A GlobalAudioPlayer at App level shows a mini bar when away from Reader.
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { audioPositionManager } from "@/lib/audioPositionPersistence";
import { supabase } from "@/integrations/supabase/client";

export interface GlobalAudioState {
  bookId: string | null;
  chapterId: string | null;
  bookTitle: string | null;
  chapterTitle: string | null;
  voice: string;
  chunkIndex: number;
  totalChunks: number;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number; // 0-100 chunk progress
}

interface AudioContextValue {
  state: GlobalAudioState;
  /** The shared Audio element — survives route changes */
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  /** Update state fields */
  update: (partial: Partial<GlobalAudioState>) => void;
  /** Pause and persist position */
  pause: () => void;
  /** Full stop — reset everything */
  stopAndClear: () => void;
  /** Check if there's a resumable session */
  hasResumableSession: (bookId: string, chapterId: string) => boolean;
}

const defaultState: GlobalAudioState = {
  bookId: null,
  chapterId: null,
  bookTitle: null,
  chapterTitle: null,
  voice: "alloy",
  chunkIndex: 0,
  totalChunks: 0,
  isPlaying: false,
  isLoading: false,
  progress: 0,
};

const AudioCtx = createContext<AudioContextValue>({
  state: defaultState,
  audioRef: { current: null },
  update: () => {},
  pause: () => {},
  stopAndClear: () => {},
  hasResumableSession: () => false,
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalAudioState>(defaultState);
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Single Audio element that lives for the lifetime of the app
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Create the persistent audio element on mount
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return () => {
      // App unmount — clean up
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const update = useCallback((partial: Partial<GlobalAudioState>) => {
    setState(prev => {
      const next = { ...prev, ...partial };
      // Persist position when meaningful
      if (next.bookId && next.chapterId && next.chunkIndex > 0) {
        audioPositionManager.savePosition(
          next.bookId, next.chapterId, next.chunkIndex,
          next.totalChunks > 0 ? Math.round((next.chunkIndex / next.totalChunks) * 100) : 0,
          next.voice
        );
      }
      return next;
    });
  }, []);

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* */ }
    }
    setState(prev => ({ ...prev, isPlaying: false }));
    
    if (s.bookId && s.chapterId && s.chunkIndex > 0) {
      audioPositionManager.savePosition(
        s.bookId, s.chapterId, s.chunkIndex,
        s.totalChunks > 0 ? Math.round((s.chunkIndex / s.totalChunks) * 100) : 0,
        s.voice
      );
    }
  }, []);

  const stopAndClear = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = "";
      } catch { /* */ }
    }
    setState(defaultState);
  }, []);

  const hasResumableSession = useCallback((bookId: string, chapterId: string) => {
    if (stateRef.current.bookId === bookId && stateRef.current.chapterId === chapterId && stateRef.current.chunkIndex > 0) {
      return true;
    }
    return audioPositionManager.hasPosition(bookId, chapterId);
  }, []);

  return (
    <AudioCtx.Provider value={{ state, audioRef, update, pause, stopAndClear, hasResumableSession }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useGlobalAudio() {
  return useContext(AudioCtx);
}
