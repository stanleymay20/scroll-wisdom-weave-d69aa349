/**
 * CONTRACT 5B-3: Reader Entry Speed
 * 
 * PWA-safe persistent cache for chapter details.
 * Uses IndexedDB for large data, localStorage fallback.
 * 
 * RULES:
 * - 5B-3.1: Instant Shell - Navigate immediately with cached data
 * - 5B-3.2: Cache-Primed Entry - Prefill from route state
 * - 5B-3.3: Progressive Hydration - skeleton → cached → hydrating → ready
 * - 5B-3.4: Zero Layout Shift - Skeleton matches final layout
 * - 5B-3.5: Offline Truth - Show cached data if available
 */

import { createLogger } from './logger';

const logger = createLogger('ChapterDetailCache');

// Cache version for migration
const CACHE_VERSION = 1;
const DB_NAME = 'scrolllibrary_chapter_cache';
const STORE_NAME = 'chapters';

// Only cache last N chapters to prevent storage bloat
const MAX_CACHED_CHAPTERS = 50;

/**
 * NORMALIZED CACHE SCHEMA (ISSUE 2 FIX)
 * All optional fields are explicit and safe with default guards.
 */
export interface CachedChapterDetail {
  chapterId: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  wordCount: number | null;
  contentPreview: string;           // first ~1000 chars for instant display
  fullContent: string | null;       // full content if cached
  lastReadPosition: number;         // scroll position 0-100
  lastUpdated: number;
  isGenerated: boolean;
  // Explicit optional fields - never assume presence
  academicMode: boolean | null;
  citationStyle: string | null;
  chapterReferences: unknown[] | null;
  researchMetadata: Record<string, unknown> | null;
}

/**
 * Normalize cache data to ensure all fields are safe
 */
export function normalizeCacheEntry(data: Partial<CachedChapterDetail> & { chapterId: string; bookId: string; chapterNumber: number; title: string }): CachedChapterDetail {
  return {
    chapterId: data.chapterId,
    bookId: data.bookId,
    chapterNumber: data.chapterNumber,
    title: data.title,
    wordCount: data.wordCount ?? null,
    contentPreview: data.contentPreview ?? '',
    fullContent: data.fullContent ?? null,
    lastReadPosition: data.lastReadPosition ?? 0,
    lastUpdated: data.lastUpdated ?? Date.now(),
    isGenerated: data.isGenerated ?? false,
    academicMode: data.academicMode ?? null,
    citationStyle: data.citationStyle ?? null,
    chapterReferences: data.chapterReferences ?? null,
    researchMetadata: data.researchMetadata ?? null,
  };
}

/**
 * Generate cache key from bookId + chapterNumber (ISSUE 1 FIX)
 * Deterministic key that doesn't require chapterId
 */
export function generateChapterCacheKey(bookId: string, chapterNumber: number): string {
  return `chapter:${bookId}:${chapterNumber}`;
}

/**
 * Generate cache key from chapterId (legacy support)
 */
export function generateChapterIdCacheKey(chapterId: string): string {
  return `chapter:id:${chapterId}`;
}

export interface CachedBookMeta {
  bookId: string;
  title: string;
  totalChapters: number;
  language: string | null;
}

// Deterministic loading states (Rule 5B-3.3)
export type ReaderLoadState = 
  | 'skeleton'           // Initial load, showing skeleton
  | 'cached'             // Have cache, showing immediately
  | 'hydrating'          // Have cache, fetching fresh
  | 'ready'              // Fully loaded
  | 'offline-with-cache' // Offline but have cached data
  | 'offline-empty';     // Offline with no cache

/**
 * Initialize IndexedDB for chapter cache
 */
async function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    logger.warn('IndexedDB not available');
    return null;
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, CACHE_VERSION);

      request.onerror = () => {
        logger.warn('Failed to open IndexedDB');
        resolve(null);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME);
          // Add index for LRU cleanup
          store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };
    } catch (e) {
      logger.warn('IndexedDB error:', e);
      resolve(null);
    }
  });
}

/**
 * Get value from IndexedDB
 */
async function getFromDB<T>(key: string): Promise<T | null> {
  const db = await openDB();
  if (!db) return getFromLocalStorage(key);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      request.onerror = () => {
        resolve(getFromLocalStorage(key));
      };
    } catch {
      resolve(getFromLocalStorage(key));
    }
  });
}

/**
 * Set value in IndexedDB with LRU cleanup
 */
async function setInDB<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  if (!db) {
    setInLocalStorage(key, value);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);

      tx.oncomplete = () => {
        // Cleanup old entries in background
        cleanupOldEntries(db).catch(() => {});
        resolve();
      };
      tx.onerror = () => {
        setInLocalStorage(key, value);
        resolve();
      };
    } catch {
      setInLocalStorage(key, value);
      resolve();
    }
  });
}

/**
 * Cleanup old entries to stay under MAX_CACHED_CHAPTERS
 */
async function cleanupOldEntries(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count <= MAX_CACHED_CHAPTERS) {
          resolve();
          return;
        }
        
        // Delete oldest entries
        const toDelete = count - MAX_CACHED_CHAPTERS;
        const index = store.index('lastUpdated');
        const cursorReq = index.openCursor();
        let deleted = 0;
        
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve();
          }
        };
      };
    } catch {
      resolve();
    }
  });
}

/**
 * localStorage fallback for simple browsers
 */
function getFromLocalStorage<T>(key: string): T | null {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function setInLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.warn('localStorage full or unavailable');
  }
}

// ============= PUBLIC API =============

/**
 * Get cached chapter by bookId + chapterNumber (ISSUE 1 FIX)
 * NO network call required - uses deterministic cache key
 */
export async function getCachedChapterByKey(bookId: string, chapterNumber: number): Promise<CachedChapterDetail | null> {
  const startTime = performance.now();
  const key = generateChapterCacheKey(bookId, chapterNumber);
  
  const cached = await getFromDB<CachedChapterDetail>(key);
  
  if (cached) {
    const duration = performance.now() - startTime;
    logger.debug(`Cache hit (key): chapter "${cached.title}" in ${duration.toFixed(0)}ms`);
    return normalizeCacheEntry(cached);
  }
  
  return null;
}

/**
 * Get cached chapter detail by chapterId (legacy support)
 * Returns immediately with cached data or null
 */
export async function getCachedChapter(chapterId: string): Promise<CachedChapterDetail | null> {
  const startTime = performance.now();
  const key = generateChapterIdCacheKey(chapterId);
  
  const cached = await getFromDB<CachedChapterDetail>(key);
  
  if (cached) {
    const duration = performance.now() - startTime;
    logger.debug(`Cache hit (id): chapter "${cached.title}" in ${duration.toFixed(0)}ms`);
    return normalizeCacheEntry(cached);
  }
  
  return null;
}

/**
 * Save chapter detail to persistent cache
 * Saves to BOTH key types for maximum cache hit rate
 */
export async function setCachedChapter(data: Partial<CachedChapterDetail> & { chapterId: string; bookId: string; chapterNumber: number; title: string }): Promise<void> {
  const startTime = performance.now();
  
  const normalized = normalizeCacheEntry({
    ...data,
    lastUpdated: Date.now(),
  });
  
  // Save to both keys for maximum hit rate
  const keyById = generateChapterIdCacheKey(data.chapterId);
  const keyByNumber = generateChapterCacheKey(data.bookId, data.chapterNumber);
  
  await Promise.all([
    setInDB(keyById, normalized),
    setInDB(keyByNumber, normalized),
  ]);
  
  logger.debug(`Cached chapter "${data.title}" in ${(performance.now() - startTime).toFixed(0)}ms`);
}

/**
 * Update chapter read position
 */
export async function updateChapterReadPosition(
  chapterId: string,
  position: number
): Promise<void> {
  const cached = await getCachedChapter(chapterId);
  if (cached) {
    await setCachedChapter({
      ...cached,
      lastReadPosition: position,
    });
  }
}

/**
 * Clear chapter cache (for specific chapter)
 */
export async function clearChapterCache(chapterId: string): Promise<void> {
  const key = `chapter:${chapterId}`;
  const db = await openDB();
  
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
    } catch {}
  }
  
  try {
    localStorage.removeItem(key);
  } catch {}
  
  logger.debug(`Cleared cache for chapter ${chapterId}`);
}

/**
 * Generate content preview for caching (first ~1000 chars)
 */
export function generateContentPreview(content: string | null): string {
  if (!content) return '';
  
  // Get first ~1000 chars, try to break at sentence/paragraph
  const maxLen = 1000;
  if (content.length <= maxLen) return content;
  
  let preview = content.substring(0, maxLen);
  
  // Try to break at paragraph
  const lastPara = preview.lastIndexOf('\n\n');
  if (lastPara > maxLen * 0.6) {
    preview = preview.substring(0, lastPara);
  } else {
    // Try to break at sentence
    const lastSentence = preview.lastIndexOf('. ');
    if (lastSentence > maxLen * 0.6) {
      preview = preview.substring(0, lastSentence + 1);
    }
  }
  
  return preview;
}

/**
 * Create cache entry from route state
 */
export function createCacheFromRouteState(state: {
  chapterId: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  wordCount?: number | null;
  content?: string | null;
}): CachedChapterDetail {
  return normalizeCacheEntry({
    chapterId: state.chapterId,
    bookId: state.bookId,
    chapterNumber: state.chapterNumber,
    title: state.title,
    wordCount: state.wordCount ?? null,
    contentPreview: generateContentPreview(state.content ?? null),
    fullContent: state.content ?? null,
  });
}

/**
 * Determine loading state based on conditions (Rule 5B-3.3)
 */
export function determineReaderLoadState(
  hasCachedData: boolean,
  isLoading: boolean,
  isOnline: boolean,
  hasNetworkData: boolean
): ReaderLoadState {
  // Offline states
  if (!isOnline) {
    return hasCachedData ? 'offline-with-cache' : 'offline-empty';
  }
  
  // Online states
  if (isLoading && !hasCachedData) {
    return 'skeleton';
  }
  
  if (hasCachedData && !hasNetworkData) {
    return 'cached';
  }
  
  if (isLoading && hasCachedData) {
    return 'hydrating';
  }
  
  return 'ready';
}
