/**
 * Offline Storage Manager
 * IndexedDB-based caching for offline reading, downloads, and book data
 */

const DB_NAME = 'scrolllibrary-offline';
const DB_VERSION = 1;

interface OfflineBook {
  id: string;
  title: string;
  coverUrl?: string;
  chapters: OfflineChapter[];
  cachedAt: number;
}

interface OfflineChapter {
  id: string;
  bookId: string;
  title: string;
  content: string;
  chapterNumber: number;
  cachedAt: number;
}

interface OfflineDownload {
  id: string;
  bookId: string;
  filename: string;
  format: 'pdf' | 'epub' | 'docx';
  blob: Blob;
  cachedAt: number;
}

interface OfflineAudio {
  id: string;
  chapterId: string;
  audioBlob: Blob;
  cachedAt: number;
}

class OfflineStorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Books store
        if (!db.objectStoreNames.contains('books')) {
          const booksStore = db.createObjectStore('books', { keyPath: 'id' });
          booksStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        // Chapters store
        if (!db.objectStoreNames.contains('chapters')) {
          const chaptersStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chaptersStore.createIndex('bookId', 'bookId', { unique: false });
          chaptersStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        }

        // Downloads store (PDFs, EPUBs)
        if (!db.objectStoreNames.contains('downloads')) {
          const downloadsStore = db.createObjectStore('downloads', { keyPath: 'id' });
          downloadsStore.createIndex('bookId', 'bookId', { unique: false });
          downloadsStore.createIndex('format', 'format', { unique: false });
        }

        // Audio cache store
        if (!db.objectStoreNames.contains('audio')) {
          const audioStore = db.createObjectStore('audio', { keyPath: 'id' });
          audioStore.createIndex('chapterId', 'chapterId', { unique: false });
        }

        // User engagement tracking for install prompt
        if (!db.objectStoreNames.contains('engagement')) {
          db.createObjectStore('engagement', { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // Book caching
  async cacheBook(book: Omit<OfflineBook, 'cachedAt'>): Promise<void> {
    const store = await this.getStore('books', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...book, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBook(id: string): Promise<OfflineBook | null> {
    const store = await this.getStore('books');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBooks(): Promise<OfflineBook[]> {
    const store = await this.getStore('books');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async removeBook(id: string): Promise<void> {
    const store = await this.getStore('books', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Chapter caching
  async cacheChapter(chapter: Omit<OfflineChapter, 'cachedAt'>): Promise<void> {
    const store = await this.getStore('chapters', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...chapter, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getChapter(id: string): Promise<OfflineChapter | null> {
    const store = await this.getStore('chapters');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getChaptersByBook(bookId: string): Promise<OfflineChapter[]> {
    const store = await this.getStore('chapters');
    const index = store.index('bookId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(bookId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Download caching (PDFs, EPUBs)
  async cacheDownload(download: Omit<OfflineDownload, 'cachedAt'>): Promise<void> {
    const store = await this.getStore('downloads', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...download, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDownload(id: string): Promise<OfflineDownload | null> {
    const store = await this.getStore('downloads');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getDownloadsByBook(bookId: string): Promise<OfflineDownload[]> {
    const store = await this.getStore('downloads');
    const index = store.index('bookId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(bookId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllDownloads(): Promise<OfflineDownload[]> {
    const store = await this.getStore('downloads');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Audio caching
  async cacheAudio(audio: Omit<OfflineAudio, 'cachedAt'>): Promise<void> {
    const store = await this.getStore('audio', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...audio, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAudio(chapterId: string): Promise<OfflineAudio | null> {
    const store = await this.getStore('audio');
    const index = store.index('chapterId');
    return new Promise((resolve, reject) => {
      const request = index.get(chapterId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Engagement tracking for install prompt
  async trackEngagement(key: string, value: any): Promise<void> {
    const store = await this.getStore('engagement', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getEngagement(key: string): Promise<any> {
    const store = await this.getStore('engagement');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  async incrementBooksOpened(): Promise<number> {
    const current = (await this.getEngagement('booksOpened')) || 0;
    const newValue = current + 1;
    await this.trackEngagement('booksOpened', newValue);
    return newValue;
  }

  async getBooksOpenedCount(): Promise<number> {
    return (await this.getEngagement('booksOpened')) || 0;
  }

  // Storage statistics
  async getStorageStats(): Promise<{
    books: number;
    chapters: number;
    downloads: number;
    audio: number;
    estimatedSize: number;
  }> {
    await this.init();
    if (!this.db) return { books: 0, chapters: 0, downloads: 0, audio: 0, estimatedSize: 0 };

    // Use a single transaction for all stores
    const transaction = this.db.transaction(['books', 'chapters', 'downloads', 'audio'], 'readonly');

    const [books, chapters, downloads, audio] = await Promise.all([
      new Promise<number>((resolve) => {
        const req = transaction.objectStore('books').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      }),
      new Promise<number>((resolve) => {
        const req = transaction.objectStore('chapters').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      }),
      new Promise<number>((resolve) => {
        const req = transaction.objectStore('downloads').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      }),
      new Promise<number>((resolve) => {
        const req = transaction.objectStore('audio').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      }),
    ]);

    // Estimate storage from navigator if available
    let estimatedSize = 0;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      estimatedSize = estimate.usage || 0;
    }

    return { books, chapters, downloads, audio, estimatedSize };
  }

  // Clear all offline data
  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) return;

    const stores = ['books', 'chapters', 'downloads', 'audio'];
    for (const storeName of stores) {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  // Clear old cached data (older than 30 days)
  async clearOldData(maxAgeDays = 30): Promise<number> {
    const maxAge = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let cleared = 0;

    // Clear old chapters
    const chaptersStore = await this.getStore('chapters', 'readwrite');
    const chaptersIndex = chaptersStore.index('cachedAt');
    const chaptersRange = IDBKeyRange.upperBound(maxAge);
    
    await new Promise<void>((resolve) => {
      const cursorRequest = chaptersIndex.openCursor(chaptersRange);
      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cleared++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => resolve();
    });

    return cleared;
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorageManager();

// Helper to check if we should use offline data
export function shouldUseOfflineData(): boolean {
  return !navigator.onLine;
}

// Download and cache a file
export async function cacheDownloadedFile(
  bookId: string,
  filename: string,
  format: 'pdf' | 'epub' | 'docx',
  blob: Blob
): Promise<void> {
  const id = `${bookId}-${format}`;
  await offlineStorage.cacheDownload({
    id,
    bookId,
    filename,
    format,
    blob,
  });
}

// Retrieve cached download
export async function getCachedDownload(
  bookId: string,
  format: 'pdf' | 'epub' | 'docx'
): Promise<Blob | null> {
  const id = `${bookId}-${format}`;
  const download = await offlineStorage.getDownload(id);
  return download?.blob || null;
}
