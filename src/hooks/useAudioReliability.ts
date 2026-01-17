/**
 * CONTRACT 5 - Rule 5.3 & 5.4: Audio Reliability Hook
 * 
 * Purpose: Ensure audio behaves like Spotify/Audible, not a demo TTS button
 * 
 * Features:
 * - Visibility change recovery (phone calls, tab switches)
 * - Mandatory audio state tracking
 * - Chunked TTS for preventing pauses
 * - ≤100ms action acknowledgment
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { setAudioState, type AudioState, SLA, acknowledgeAction } from '@/lib/contract5';

export type AudioPlaybackState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'error' | 'resuming';

interface AudioReliabilityOptions {
  /** Unique ID for this audio player */
  id: string;
  /** Callback when visibility changes to visible - should try to resume */
  onVisibilityResume?: () => void;
  /** Callback when audio encounters an error */
  onError?: (error: string) => void;
}

interface AudioReliabilityReturn {
  /** Current playback state */
  state: AudioPlaybackState;
  /** Human-readable message for current state */
  stateMessage: string;
  /** Set the playback state with Contract 5 compliance */
  setState: (state: AudioPlaybackState) => void;
  /** Whether playback was interrupted (tab switch, phone call) */
  wasInterrupted: boolean;
  /** Mark playback as resumed from interruption */
  clearInterruption: () => void;
  /** Acknowledge a user action (returns completion callback) */
  acknowledgeUserAction: (actionName: string) => () => void;
  /** Check if state indicates activity */
  isActive: boolean;
  /** Check if we should show loading UI */
  isLoading: boolean;
}

const STATE_MESSAGES: Record<AudioPlaybackState, string> = {
  idle: '',
  loading: 'Loading audio...',
  buffering: 'Buffering...',
  playing: 'Playing',
  paused: 'Paused',
  error: 'Audio error - tap to retry',
  resuming: 'Resuming...',
};

export function useAudioReliability(options: AudioReliabilityOptions): AudioReliabilityReturn {
  const { id, onVisibilityResume, onError } = options;
  
  const [state, setStateInternal] = useState<AudioPlaybackState>('idle');
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const wasPlayingBeforeHide = useRef(false);
  const lastStateRef = useRef<AudioPlaybackState>('idle');

  // Update Contract 5 audio state tracking
  const setState = useCallback((newState: AudioPlaybackState) => {
    setStateInternal(newState);
    lastStateRef.current = newState;
    
    // Map to Contract 5 AudioState
    const contract5State: AudioState = 
      newState === 'playing' ? 'playing' :
      newState === 'paused' ? 'paused' :
      newState === 'buffering' || newState === 'loading' || newState === 'resuming' ? 'buffering' :
      newState === 'error' ? 'error' : 'idle';
    
    setAudioState(id, contract5State);
    
    if (newState === 'error' && onError) {
      onError('Audio playback error');
    }
  }, [id, onError]);

  // CONTRACT 5: Visibility change handler for interrupt recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Store if we were playing before hide
        if (lastStateRef.current === 'playing') {
          wasPlayingBeforeHide.current = true;
        }
      } else if (document.visibilityState === 'visible') {
        // Tab/app is visible again
        if (wasPlayingBeforeHide.current) {
          setWasInterrupted(true);
          wasPlayingBeforeHide.current = false;
          
          // Try to resume after a short delay
          setTimeout(() => {
            if (onVisibilityResume) {
              setState('resuming');
              onVisibilityResume();
            }
          }, 500);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onVisibilityResume, setState]);

  // Acknowledge user action with ≤100ms response
  const acknowledgeUserAction = useCallback((actionName: string) => {
    return acknowledgeAction(`${id}-${actionName}`);
  }, [id]);

  const clearInterruption = useCallback(() => {
    setWasInterrupted(false);
    wasPlayingBeforeHide.current = false;
  }, []);

  return {
    state,
    stateMessage: STATE_MESSAGES[state],
    setState,
    wasInterrupted,
    clearInterruption,
    acknowledgeUserAction,
    isActive: state === 'playing' || state === 'loading' || state === 'buffering' || state === 'resuming',
    isLoading: state === 'loading' || state === 'buffering' || state === 'resuming',
  };
}

/**
 * CONTRACT 5 - Rule 5.3: Optimal chunk sizes for TTS
 * First chunk should be small (≤200 chars) for instant audio start
 * Subsequent chunks can be larger (600-800 chars)
 */
export const AUDIO_CHUNK_SIZES = {
  FIRST_CHUNK: 200,      // Fast start
  STANDARD_CHUNK: 600,   // Good quality without pauses
  MAX_CHUNK: 800,        // Upper limit
  MIN_BUFFER_AHEAD: 1,   // Buffer next chunk before current ends
} as const;

/**
 * Chunk text for optimal TTS playback
 * Returns smaller first chunk for instant audio, larger subsequent chunks
 */
export function chunkTextForTTS(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  let isFirstChunk = true;

  for (const sentence of sentences) {
    const maxSize = isFirstChunk ? AUDIO_CHUNK_SIZES.FIRST_CHUNK : AUDIO_CHUNK_SIZES.STANDARD_CHUNK;
    
    if (!current) {
      current = sentence;
      continue;
    }
    
    if ((current + " " + sentence).length <= maxSize) {
      current = current + " " + sentence;
    } else {
      chunks.push(current);
      current = sentence;
      isFirstChunk = false;
    }
  }
  
  if (current) chunks.push(current);
  if (chunks.length === 0) return [cleaned.slice(0, AUDIO_CHUNK_SIZES.FIRST_CHUNK)];
  
  return chunks;
}
