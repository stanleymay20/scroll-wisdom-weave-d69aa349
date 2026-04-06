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

    const audio = audioRef.current;
    audio.preload = "auto";
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");

    const syncPlaying = () => {
      setState(prev => {
        const nextIsPlaying = !audio.paused && !audio.ended;
        if (prev.isPlaying === nextIsPlaying && prev.isLoading === false) return prev;
        return { ...prev, isPlaying: nextIsPlaying, isLoading: false };
      });
    };

    const syncWaiting = () => {
      setState(prev => {
        if (prev.isLoading) return prev;
        return { ...prev, isLoading: true };
      });
    };

    const syncStopped = () => {
      setState(prev => {
        if (!prev.isPlaying && !prev.isLoading) return prev;
        return { ...prev, isPlaying: false, isLoading: false };
      });
    };

    audio.addEventListener("playing", syncPlaying);
    audio.addEventListener("canplay", syncPlaying);
    audio.addEventListener("canplaythrough", syncPlaying);
    audio.addEventListener("waiting", syncWaiting);
    audio.addEventListener("pause", syncStopped);
    audio.addEventListener("ended", syncStopped);
    audio.addEventListener("error", syncStopped);

    return () => {
      // App unmount — clean up
      const currentSrc = audio.currentSrc || audio.src;
      audio.removeEventListener("playing", syncPlaying);
      audio.removeEventListener("canplay", syncPlaying);
      audio.removeEventListener("canplaythrough", syncPlaying);
      audio.removeEventListener("waiting", syncWaiting);
      audio.removeEventListener("pause", syncStopped);
      audio.removeEventListener("ended", syncStopped);
      audio.removeEventListener("error", syncStopped);
      audio.pause();
      audio.removeAttribute("src");
      audio.src = "";

      if (currentSrc.startsWith("blob:")) {
        URL.revokeObjectURL(currentSrc);
      }
    };
  }, []);

  const resetSharedAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentSrc = audio.currentSrc || audio.src;

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
      audio.src = "";
    } catch {
      try {
        audio.src = "";
      } catch {
        /* noop */
      }
    }

    if (currentSrc.startsWith("blob:")) {
      URL.revokeObjectURL(currentSrc);
    }
  }, []);

  const update = useCallback((partial: Partial<GlobalAudioState>) => {
    setState(prev => {
      const entries = Object.entries(partial) as Array<[keyof GlobalAudioState, GlobalAudioState[keyof GlobalAudioState]]>;
      const hasChanges = entries.some(([key, value]) => prev[key] !== value);
      if (!hasChanges) return prev;

      const next = { ...prev, ...partial };
      const shouldPersistPosition =
        !!next.bookId &&
        !!next.chapterId &&
        next.chunkIndex > 0 &&
        (
          prev.bookId !== next.bookId ||
          prev.chapterId !== next.chapterId ||
          prev.chunkIndex !== next.chunkIndex ||
          prev.voice !== next.voice ||
          prev.totalChunks !== next.totalChunks
        );

      if (shouldPersistPosition) {
        const persistedChunkIndex = Math.max(0, next.chunkIndex - 1);
        audioPositionManager.savePosition(
          next.bookId, next.chapterId, persistedChunkIndex,
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

    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* noop */
      }
    }

    setState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    
    if (s.bookId && s.chapterId && s.chunkIndex > 0) {
      const persistedChunkIndex = Math.max(0, s.chunkIndex - 1);
      audioPositionManager.savePosition(
        s.bookId, s.chapterId, persistedChunkIndex,
        s.totalChunks > 0 ? Math.round((s.chunkIndex / s.totalChunks) * 100) : 0,
        s.voice
      );
    }
  }, []);

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
