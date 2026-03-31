/**
 * Global Audio Context — Route-Safe Audio Engine
 * 
 * Owns the HTMLAudioElement so playback survives route changes.
 * The TTSMiniPlayer in Reader writes chunks to this engine.
 * A GlobalAudioPlayer at App level shows a mini bar when away from Reader.
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { audioPositionManager } from "@/lib/audioPositionPersistence";

export interface GlobalAudioState {
  bookId: string | null;
  chapterId: string | null;
  chapterNumber: number | null;
  readerPath: string | null;
  bookTitle: string | null;
  chapterTitle: string | null;
  voice: string;
  chunkIndex: number;
  totalChunks: number;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number; // 0-100 chunk progress
}

interface GlobalAudioControls {
  pause?: () => void;
  play?: () => void;
  stop?: () => void;
}

interface AudioContextValue {
  state: GlobalAudioState;
  /** The shared Audio element — survives route changes */
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  /** Update state fields */
  update: (partial: Partial<GlobalAudioState>) => void;
  /** Pause and persist position */
  pause: () => void;
  /** Resume current audio session */
  play: () => void;
  /** Full stop — reset everything */
  stopAndClear: () => void;
  /** Register player controls for route-safe mini player handoff */
  registerControls: (controls: GlobalAudioControls | null) => void;
  /** Check if there's a resumable session */
  hasResumableSession: (bookId: string, chapterId: string) => boolean;
}

const defaultState: GlobalAudioState = {
  bookId: null,
  chapterId: null,
  chapterNumber: null,
  readerPath: null,
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
  play: () => {},
  stopAndClear: () => {},
  registerControls: () => {},
  hasResumableSession: () => false,
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GlobalAudioState>(defaultState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const controlsRef = useRef<GlobalAudioControls | null>(null);
  const isStoppingRef = useRef(false);
  
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

  const resetSharedAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.onwaiting = null;
      audio.oncanplay = null;
      audio.oncanplaythrough = null;
      audio.removeAttribute("src");
      audio.load();
    } catch {
      try {
        audio.src = "";
      } catch {
        /* noop */
      }
    }
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

  const registerControls = useCallback((controls: GlobalAudioControls | null) => {
    controlsRef.current = controls;
  }, []);

  const pause = useCallback(() => {
    const s = stateRef.current;
    controlsRef.current?.pause?.();
    resetSharedAudioElement();
    setState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    
    if (s.bookId && s.chapterId && s.chunkIndex > 0) {
      audioPositionManager.savePosition(
        s.bookId, s.chapterId, s.chunkIndex,
        s.totalChunks > 0 ? Math.round((s.chunkIndex / s.totalChunks) * 100) : 0,
        s.voice
      );
    }
  }, [resetSharedAudioElement]);

  const play = useCallback(() => {
    controlsRef.current?.play?.();

    if (!controlsRef.current?.play && audioRef.current) {
      audioRef.current.play().catch(() => {
        /* handled by player UI */
      });
    }

    setState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
  }, []);

  const stopAndClear = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    const controls = controlsRef.current;
    controlsRef.current = null;
    controls?.stop?.();

    resetSharedAudioElement();
    setState(defaultState);
    controlsRef.current = null;

    queueMicrotask(() => {
      isStoppingRef.current = false;
    });
  }, [resetSharedAudioElement]);

  const hasResumableSession = useCallback((bookId: string, chapterId: string) => {
    if (stateRef.current.bookId === bookId && stateRef.current.chapterId === chapterId && stateRef.current.chunkIndex > 0) {
      return true;
    }
    return audioPositionManager.hasPosition(bookId, chapterId);
  }, []);

  return (
    <AudioCtx.Provider value={{ state, audioRef, update, pause, play, stopAndClear, registerControls, hasResumableSession }}>
      {children}
    </AudioCtx.Provider>
  );
}

export function useGlobalAudio() {
  return useContext(AudioCtx);
}
