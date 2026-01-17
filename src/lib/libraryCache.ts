/**
 * CONTRACT 5B-1: Library Entry Speed
 * 
 * PWA-safe persistent cache for library items.
 * Uses IndexedDB for large data, localStorage fallback.
 * 
 * RULES:
 * - 5B-1.2: Cached Snapshot Load - render cached data immediately
 * - 5B-1.4: Deterministic Loading States
 * - 5B-1.5: Offline Truthfulness
 */

import { createLogger } from './logger';

const logger = createLogger('LibraryCache');

// Cache version for migration
const CACHE_VERSION = 1;
const DB_NAME = 'scrolllibrary_cache';
const STORE_NAME = 'library';
const STATS_KEY = 'library:stats';
const ITEMS_KEY = 'library:items';
const METADATA_KEY = 'library:metadata';

export interface CachedLibraryItem {
  id: string;
  book_id: string;
  title: string;
  cover_image_url: string | null;
  category: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  total_chapters: number | null;
  created_at: string;
}

export interface CachedLibraryStats {
  total: number;
  reading: number;
  completed: number;
}

interface CacheMetadata {
  version: number;
  lastUpdated: number;
  userId: string | null;
}

// Deterministic loading states (Rule 5B-1.4)
export type LibraryLoadState = 
  | 'skeleton'           // Initial load, showing skeleton
  | 'hydrating'          // Have cache, fetching fresh
  | 'ready'              // Fully loaded
  | 'offline-with-cache' // Offline but have cached data
  | 'offline-empty';     // Offline with no cache

/**
 * Initialize IndexedDB for library cache
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
 * Get cached library items (INSTANT - Rule 5B-1.2)
 * Returns immediately with cached data or null
 */
export async function getCachedLibrary(userId: string): Promise<CachedLibraryItem[] | null> {
  const startTime = performance.now();
  
  // Check metadata matches current user
  const metadata = await getFromDB<CacheMetadata>(METADATA_KEY);
  if (metadata?.userId !== userId) {
    logger.debug('Cache miss: different user');
    return null;
  }

  const items = await getFromDB<CachedLibraryItem[]>(ITEMS_KEY);
  
  if (items) {
    const duration = performance.now() - startTime;
    logger.debug(`Cache hit: ${items.length} items in ${duration.toFixed(0)}ms`);
  }
  
  return items;
}

/**
 * Get cached library stats (INSTANT)
 */
export async function getCachedStats(): Promise<CachedLibraryStats | null> {
  return getFromDB<CachedLibraryStats>(STATS_KEY);
}

/**
 * Save library items to persistent cache
 */
export async function setCachedLibrary(
  userId: string, 
  items: CachedLibraryItem[]
): Promise<void> {
  const startTime = performance.now();
  
  // Save items
  await setInDB(ITEMS_KEY, items);
  
  // Update metadata
  const metadata: CacheMetadata = {
    version: CACHE_VERSION,
    lastUpdated: Date.now(),
    userId,
  };
  await setInDB(METADATA_KEY, metadata);
  
  logger.debug(`Cached ${items.length} items in ${(performance.now() - startTime).toFixed(0)}ms`);
}

/**
 * Save library stats to persistent cache
 */
export async function setCachedStats(stats: CachedLibraryStats): Promise<void> {
  await setInDB(STATS_KEY, stats);
}

/**
 * Get cache metadata (for diagnostics)
 */
export async function getCacheMetadata(): Promise<CacheMetadata | null> {
  return getFromDB<CacheMetadata>(METADATA_KEY);
}

/**
 * Clear library cache (on logout or user switch)
 */
export async function clearLibraryCache(): Promise<void> {
  const db = await openDB();
  if (db) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  }
  
  try {
    localStorage.removeItem(ITEMS_KEY);
    localStorage.removeItem(STATS_KEY);
    localStorage.removeItem(METADATA_KEY);
  } catch {}
  
  logger.info('Library cache cleared');
}

/**
 * Transform Supabase library response to cached format
 */
export function transformToCachedItem(item: {
  id: string;
  book_id: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  created_at: string;
  books: {
    id: string;
    title: string;
    cover_image_url: string | null;
    category: string;
    total_chapters: number | null;
  };
}): CachedLibraryItem {
  return {
    id: item.id,
    book_id: item.book_id,
    title: item.books.title,
    cover_image_url: item.books.cover_image_url,
    category: item.books.category,
    progress_percent: item.progress_percent,
    last_read_chapter: item.last_read_chapter,
    total_chapters: item.books.total_chapters,
    created_at: item.created_at,
  };
}

/**
 * Determine loading state based on conditions (Rule 5B-1.4)
 */
export function determineLoadState(
  hasCachedData: boolean,
  isLoading: boolean,
  isOnline: boolean,
  hasNetworkData: boolean
): LibraryLoadState {
  // Offline states
  if (!isOnline) {
    return hasCachedData ? 'offline-with-cache' : 'offline-empty';
  }
  
  // Online states
  if (isLoading && !hasCachedData) {
    return 'skeleton';
  }
  
  if (isLoading && hasCachedData) {
    return 'hydrating';
  }
  
  return 'ready';
}
