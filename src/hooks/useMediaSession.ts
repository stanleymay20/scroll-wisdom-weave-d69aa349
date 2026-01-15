/**
 * CONTRACT 5 - Rule 5.3: Audio as First-Class Experience
 * 
 * Use Media Session API to:
 * - Survive screen lock
 * - Survive app backgrounding
 * - Survive UI navigation
 * - Show in system media controls
 */

import { useEffect, useCallback, useRef } from 'react';
import { setAudioState, type AudioState } from '@/lib/contract5';

interface MediaSessionOptions {
  /** Unique identifier for this audio player */
  id: string;
  /** Title shown in system controls */
  title: string;
  /** Artist/author shown in system controls */
  artist?: string;
  /** Album/book title */
  album?: string;
  /** Artwork URL for system controls */
  artworkUrl?: string;
  /** Callback when play is triggered from system */
  onPlay?: () => void;
  /** Callback when pause is triggered from system */
  onPause?: () => void;
  /** Callback when stop is triggered from system */
  onStop?: () => void;
  /** Callback when seek backward is triggered */
  onSeekBackward?: () => void;
  /** Callback when seek forward is triggered */
  onSeekForward?: () => void;
}

export function useMediaSession(options: MediaSessionOptions) {
  const {
    id,
    title,
    artist = 'ScrollLibrary',
    album,
    artworkUrl,
    onPlay,
    onPause,
    onStop,
    onSeekBackward,
    onSeekForward,
  } = options;

  const isActiveRef = useRef(false);

  // Update media session metadata
  const updateMetadata = useCallback(() => {
    if (!('mediaSession' in navigator)) return;

    const artwork = artworkUrl ? [
      { src: artworkUrl, sizes: '512x512', type: 'image/png' },
    ] : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: album || 'Reading',
      artwork,
    });
  }, [title, artist, album, artworkUrl]);

  // Set playback state for system controls
  const setPlaybackState = useCallback((state: AudioState) => {
    if (!('mediaSession' in navigator)) return;
    
    setAudioState(id, state);
    
    if (state === 'playing') {
      navigator.mediaSession.playbackState = 'playing';
    } else if (state === 'paused' || state === 'buffering') {
      navigator.mediaSession.playbackState = 'paused';
    } else {
      navigator.mediaSession.playbackState = 'none';
    }
  }, [id]);

  // Activate media session with handlers
  const activate = useCallback(() => {
    if (!('mediaSession' in navigator) || isActiveRef.current) return;

    isActiveRef.current = true;
    updateMetadata();

    // Set action handlers
    if (onPlay) {
      navigator.mediaSession.setActionHandler('play', onPlay);
    }
    if (onPause) {
      navigator.mediaSession.setActionHandler('pause', onPause);
    }
    if (onStop) {
      navigator.mediaSession.setActionHandler('stop', onStop);
    }
    if (onSeekBackward) {
      navigator.mediaSession.setActionHandler('seekbackward', onSeekBackward);
    }
    if (onSeekForward) {
      navigator.mediaSession.setActionHandler('seekforward', onSeekForward);
    }
  }, [updateMetadata, onPlay, onPause, onStop, onSeekBackward, onSeekForward]);

  // Deactivate media session
  const deactivate = useCallback(() => {
    if (!('mediaSession' in navigator) || !isActiveRef.current) return;

    isActiveRef.current = false;
    setAudioState(id, 'idle');

    // Clear action handlers
    try {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
    } catch {
      // Some browsers don't support clearing handlers
    }
  }, [id]);

  // Update position state for progress
  const updatePosition = useCallback((currentTime: number, duration: number, playbackRate = 1) => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: currentTime,
      });
    } catch {
      // Position state not supported in all browsers
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      deactivate();
    };
  }, [deactivate]);

  return {
    activate,
    deactivate,
    updateMetadata,
    setPlaybackState,
    updatePosition,
    isSupported: 'mediaSession' in navigator,
  };
}
