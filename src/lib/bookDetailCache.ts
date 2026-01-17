/**
 * CONTRACT 5B-2: Book Detail Entry Speed
 * 
 * PWA-safe persistent cache for book details.
 * Uses IndexedDB for large data, localStorage fallback.
 * 
 * RULES:
 * - 5B-2.1: Instant Shell - Navigate immediately with cached data
 * - 5B-2.2: Cache-Primed Entry - Prefill from library cache
 * - 5B-2.3: Progressive Hydration - Load layers independently
 * - 5B-2.4: Zero Layout Shift - Skeleton matches final layout
 * - 5B-2.5: Offline Truth - Show cached data if available
 */

import { createLogger } from './logger';

const logger = createLogger('BookDetailCache');

// Cache version for migration
const CACHE_VERSION = 1;
const DB_NAME = 'scrolllibrary_bookdetail_cache';
const STORE_NAME = 'books';

export interface CachedBookDetail {
  id: string;
  title: string;
  description: string | null;
  category: string;
  cover_image_url: string | null;
  total_chapters: number | null;
  book_type: string | null;
  language: string | null;
  is_published: boolean | null;
  creator_id: string | null;
  author_ai_agent: string | null;
}

export interface CachedChapter {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
  is_generated: boolean | null;
}

export interface CachedBookWithChapters {
  book: CachedBookDetail;
  chapters: CachedChapter[];
  lastUpdated: number;
  progressPercent?: number;
  lastReadChapter?: number;
}

// Deterministic loading states (Rule 5B-2.3)
export type BookDetailLoadState = 
  | 'skeleton'           // Initial load, showing skeleton
  | 'cached'             // Have cache, showing immediately
  | 'hydrating'          // Have cache, fetching fresh
  | 'ready'              // Fully loaded
  | 'offline-with-cache' // Offline but have cached data
  | 'offline-empty';     // Offline with no cache

/**
 * Initialize IndexedDB for book detail cache
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
          db.createObjectStore(STORE_NAME);
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
 * Set value in IndexedDB
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

      tx.oncomplete = () => resolve();
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
 * Get cached book detail (INSTANT - Rule 5B-2.1)
 * Returns immediately with cached data or null
 */
export async function getCachedBookDetail(bookId: string): Promise<CachedBookWithChapters | null> {
  const startTime = performance.now();
  const key = `bookdetail:${bookId}`;
  
  const cached = await getFromDB<CachedBookWithChapters>(key);
  
  if (cached) {
    const duration = performance.now() - startTime;
    logger.debug(`Cache hit: book "${cached.book.title}" in ${duration.toFixed(0)}ms`);
  }
  
  return cached;
}

/**
 * Save book detail to persistent cache
 */
export async function setCachedBookDetail(
  bookId: string, 
  data: CachedBookWithChapters
): Promise<void> {
  const startTime = performance.now();
  const key = `bookdetail:${bookId}`;
  
  await setInDB(key, {
    ...data,
    lastUpdated: Date.now(),
  });
  
  logger.debug(`Cached book "${data.book.title}" in ${(performance.now() - startTime).toFixed(0)}ms`);
}

/**
 * Update cached book with progress info from library
 */
export async function updateCachedBookProgress(
  bookId: string,
  progressPercent: number,
  lastReadChapter: number
): Promise<void> {
  const cached = await getCachedBookDetail(bookId);
  if (cached) {
    await setCachedBookDetail(bookId, {
      ...cached,
      progressPercent,
      lastReadChapter,
    });
  }
}

/**
 * Clear book detail cache (for specific book)
 */
export async function clearBookDetailCache(bookId: string): Promise<void> {
  const key = `bookdetail:${bookId}`;
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
  
  logger.debug(`Cleared cache for book ${bookId}`);
}

/**
 * Transform library item to cached book detail for pre-navigation caching
 * This is used when clicking a book from library - we already have some data
 */
export function transformLibraryItemToCache(item: {
  book_id: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  books: {
    id: string;
    title: string;
    description?: string | null;
    category: string;
    cover_image_url: string | null;
    total_chapters: number | null;
    book_type?: string | null;
  };
}): CachedBookWithChapters {
  return {
    book: {
      id: item.books.id,
      title: item.books.title,
      description: item.books.description ?? null,
      category: item.books.category,
      cover_image_url: item.books.cover_image_url,
      total_chapters: item.books.total_chapters,
      book_type: item.books.book_type ?? 'text',
      language: null,
      is_published: null,
      creator_id: null,
      author_ai_agent: null,
    },
    chapters: [], // Will be hydrated on book detail page
    lastUpdated: Date.now(),
    progressPercent: item.progress_percent ?? 0,
    lastReadChapter: item.last_read_chapter ?? 1,
  };
}

/**
 * Determine loading state based on conditions (Rule 5B-2.3)
 */
export function determineBookDetailLoadState(
  hasCachedData: boolean,
  isLoading: boolean,
  isOnline: boolean,
  hasNetworkData: boolean
): BookDetailLoadState {
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
