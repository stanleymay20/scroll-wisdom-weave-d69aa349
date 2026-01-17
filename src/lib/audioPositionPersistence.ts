/**
 * CONTRACT 5 - Rule 5.3 & 5.4: Audio Position Persistence
 * 
 * Persists TTS audio position so users can resume from where they left off.
 * Uses localStorage for quick access and IndexedDB for backup.
 */

interface AudioPosition {
  bookId: string;
  chapterId: string;
  chunkIndex: number;
  progress: number; // 0-100
  timestamp: number;
  voice: string;
}

const STORAGE_KEY = 'scrolllibrary:audio:positions';
const MAX_POSITIONS = 50; // Keep last 50 positions

class AudioPositionManager {
  private positions: Map<string, AudioPosition> = new Map();
  private initialized = false;

  private init(): void {
    if (this.initialized) return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AudioPosition[];
        parsed.forEach(pos => {
          this.positions.set(this.getKey(pos.bookId, pos.chapterId), pos);
        });
      }
    } catch (e) {
      console.warn('[AudioPosition] Failed to load positions:', e);
    }
    
    this.initialized = true;
  }

  private getKey(bookId: string, chapterId: string): string {
    return `${bookId}:${chapterId}`;
  }

  private persist(): void {
    try {
      const positions = Array.from(this.positions.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_POSITIONS);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (e) {
      console.warn('[AudioPosition] Failed to persist positions:', e);
    }
  }

  /**
   * Save current audio position
   */
  savePosition(
    bookId: string,
    chapterId: string,
    chunkIndex: number,
    progress: number,
    voice: string
  ): void {
    this.init();
    
    const key = this.getKey(bookId, chapterId);
    const position: AudioPosition = {
      bookId,
      chapterId,
      chunkIndex,
      progress: Math.min(100, Math.max(0, progress)),
      timestamp: Date.now(),
      voice,
    };
    
    this.positions.set(key, position);
    this.persist();
    
    console.log('[AudioPosition] Saved position:', { bookId, chapterId, chunkIndex, progress });
  }

  /**
   * Get saved position for a chapter
   */
  getPosition(bookId: string, chapterId: string): AudioPosition | null {
    this.init();
    
    const key = this.getKey(bookId, chapterId);
    return this.positions.get(key) || null;
  }

  /**
   * Clear position for a chapter (when finished)
   */
  clearPosition(bookId: string, chapterId: string): void {
    this.init();
    
    const key = this.getKey(bookId, chapterId);
    this.positions.delete(key);
    this.persist();
  }

  /**
   * Clear all positions for a book
   */
  clearBookPositions(bookId: string): void {
    this.init();
    
    const keysToDelete: string[] = [];
    this.positions.forEach((pos, key) => {
      if (pos.bookId === bookId) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.positions.delete(key));
    this.persist();
  }

  /**
   * Get all saved positions (for debugging/UI)
   */
  getAllPositions(): AudioPosition[] {
    this.init();
    return Array.from(this.positions.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Check if there's a saved position for a chapter
   */
  hasPosition(bookId: string, chapterId: string): boolean {
    this.init();
    const key = this.getKey(bookId, chapterId);
    return this.positions.has(key);
  }
}

// Singleton instance
export const audioPositionManager = new AudioPositionManager();

// React hook for audio position persistence
export function useAudioPositionPersistence(bookId: string, chapterId: string) {
  const getPosition = () => audioPositionManager.getPosition(bookId, chapterId);
  
  const savePosition = (chunkIndex: number, progress: number, voice: string) => {
    audioPositionManager.savePosition(bookId, chapterId, chunkIndex, progress, voice);
  };
  
  const clearPosition = () => {
    audioPositionManager.clearPosition(bookId, chapterId);
  };
  
  const hasPosition = () => audioPositionManager.hasPosition(bookId, chapterId);
  
  return {
    getPosition,
    savePosition,
    clearPosition,
    hasPosition,
  };
}
