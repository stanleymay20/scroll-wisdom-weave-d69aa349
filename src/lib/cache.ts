/**
 * Enterprise-grade caching layer
 * Provides in-memory caching with TTL, size limits, and cache invalidation
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  size: number;
}

interface CacheConfig {
  maxSize: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
};

class Cache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // Enforce size limit (LRU-style: remove oldest entries)
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttl ?? this.config.defaultTTL),
      size: JSON.stringify(value).length,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries matching a prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; maxSize: number; memoryUsage: number } {
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += entry.size;
    }
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage,
    };
  }

  /**
   * Get or set with callback
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }
}

// ============= Global Cache Instances =============

// API response cache
export const apiCache = new Cache({ maxSize: 200, defaultTTL: 2 * 60 * 1000 }); // 2 min

// User data cache (longer TTL)
export const userCache = new Cache({ maxSize: 50, defaultTTL: 10 * 60 * 1000 }); // 10 min

// Static data cache (longer TTL)
export const staticCache = new Cache({ maxSize: 100, defaultTTL: 30 * 60 * 1000 }); // 30 min

// ============= Cache Key Generators =============

export const cacheKeys = {
  book: (id: string) => `book:${id}`,
  bookChapters: (bookId: string) => `book:${bookId}:chapters`,
  chapter: (chapterId: string) => `chapter:${chapterId}`,
  userProfile: (userId: string) => `user:${userId}:profile`,
  userBooks: (userId: string) => `user:${userId}:books`,
  userLibrary: (userId: string) => `user:${userId}:library`,
  subscription: (userId: string) => `user:${userId}:subscription`,
  faqs: () => `faqs`,
  featuredBooks: () => `books:featured`,
  categoryBooks: (category: string) => `books:category:${category}`,
  libraryItems: (userId: string, page: number) => `user:${userId}:library:page:${page}`,
};

// ============= Cache Invalidation Helpers =============

/**
 * Invalidate all user-related caches
 */
export function invalidateUserCache(userId: string): void {
  userCache.invalidatePrefix(`user:${userId}`);
  apiCache.invalidatePrefix(`user:${userId}`);
}

/**
 * Invalidate all book-related caches
 */
export function invalidateBookCache(bookId: string): void {
  apiCache.delete(cacheKeys.book(bookId));
  apiCache.delete(cacheKeys.bookChapters(bookId));
  apiCache.invalidatePrefix(`chapter:`);
}

/**
 * Clear all caches (use sparingly)
 */
export function clearAllCaches(): void {
  apiCache.clear();
  userCache.clear();
  staticCache.clear();
}

export default Cache;
