/**
 * CONTRACT 5B-1: Library Data Hook
 * 
 * Implements skeleton-first, cache-first library loading.
 * 
 * RULES:
 * - 5B-1.1: Skeleton-First Render - UI renders before fetch
 * - 5B-1.2: Cached Snapshot Load - render cache immediately
 * - 5B-1.3: Progressive Hydration - no blocking
 * - 5B-1.4: Deterministic Loading States
 * - 5B-1.5: Offline Truthfulness
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getCachedLibrary, 
  getCachedStats,
  setCachedLibrary, 
  setCachedStats,
  transformToCachedItem,
  determineLoadState,
  type CachedLibraryItem,
  type CachedLibraryStats,
  type LibraryLoadState
} from '@/lib/libraryCache';
import { markFirstContent, markCacheRender, markInteractive } from '@/lib/contract5';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useLibraryData');

const ITEMS_PER_PAGE = 12;
const MOBILE_ITEMS_PER_PAGE = 8;

interface LibraryItem {
  id: string;
  book_id: string;
  progress_percent: number | null;
  last_read_chapter: number | null;
  created_at: string;
  books: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    cover_image_url: string | null;
    total_chapters: number | null;
  };
}

interface UseLibraryDataOptions {
  isMobile?: boolean;
  userId?: string | null;
}

interface UseLibraryDataReturn {
  // Data
  items: LibraryItem[];
  stats: CachedLibraryStats;
  
  // State (Rule 5B-1.4)
  loadState: LibraryLoadState;
  isLoading: boolean;
  isHydrating: boolean;
  error: string | null;
  
  // Pagination
  hasMore: boolean;
  isLoadingMore: boolean;
  
  // Actions
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  removeItem: (libraryId: string) => void;
}

export function useLibraryData({ 
  isMobile = false, 
  userId 
}: UseLibraryDataOptions): UseLibraryDataReturn {
  // Core state
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [stats, setStats] = useState<CachedLibraryStats>({ total: 0, reading: 0, completed: 0 });
  const [loadState, setLoadState] = useState<LibraryLoadState>('skeleton');
  const [error, setError] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Refs for tracking
  const hasCachedData = useRef(false);
  const isOnline = useRef(navigator.onLine);
  const mountedRef = useRef(true);
  const initCompleteRef = useRef(false);
  
  // Track online status
  useEffect(() => {
    const handleOnline = () => { isOnline.current = true; };
    const handleOffline = () => { isOnline.current = false; };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // RULE 5B-1.2: Load cached data IMMEDIATELY
  useEffect(() => {
    if (!userId || initCompleteRef.current) return;
    
    const loadCachedData = async () => {
      const startTime = performance.now();
      markFirstContent('Library');
      
      try {
        // Load cached items in parallel
        const [cachedItems, cachedStats] = await Promise.all([
          getCachedLibrary(userId),
          getCachedStats(),
        ]);
        
        if (!mountedRef.current) return;
        
        if (cachedItems && cachedItems.length > 0) {
          // Transform cached items to full LibraryItem format
          const transformedItems: LibraryItem[] = cachedItems.map(item => ({
            id: item.id,
            book_id: item.book_id,
            progress_percent: item.progress_percent,
            last_read_chapter: item.last_read_chapter,
            created_at: item.created_at,
            books: {
              id: item.book_id,
              title: item.title,
              description: null,
              category: item.category,
              cover_image_url: item.cover_image_url,
              total_chapters: item.total_chapters,
            },
          }));
          
          setItems(transformedItems);
          hasCachedData.current = true;
          
          const cacheTime = performance.now() - startTime;
          markCacheRender('Library');
          logger.info(`Cache rendered in ${cacheTime.toFixed(0)}ms`);
        }
        
        if (cachedStats) {
          setStats(cachedStats);
        }
        
        // Update load state
        setLoadState(determineLoadState(
          hasCachedData.current,
          true, // Still loading fresh
          isOnline.current,
          false
        ));
        
      } catch (e) {
        logger.warn('Failed to load cached data:', e);
      }
      
      initCompleteRef.current = true;
    };
    
    // Execute immediately - no setTimeout for cache
    loadCachedData();
    
    return () => {
      mountedRef.current = false;
    };
  }, [userId]);
  
  // Fetch fresh data from network
  const fetchItems = useCallback(async (pageNum: number, reset = false) => {
    if (!userId) return;
    
    const limit = isMobile ? MOBILE_ITEMS_PER_PAGE : ITEMS_PER_PAGE;
    const from = pageNum * limit;
    const to = from + limit - 1;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('user_library')
        .select(`
          id,
          book_id,
          progress_percent,
          last_read_chapter,
          created_at,
          books!inner (
            id,
            title,
            description,
            category,
            cover_image_url,
            total_chapters
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      
      if (fetchError) throw fetchError;
      if (!mountedRef.current) return;
      
      const newItems = (data as LibraryItem[]) || [];
      
      if (reset) {
        setItems(newItems);
        setPage(0);
        
        // Cache the fresh data
        const cachedItems = newItems.map(item => transformToCachedItem(item));
        setCachedLibrary(userId, cachedItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
        setPage(pageNum);
      }
      
      setHasMore(newItems.length === limit);
      setError(null);
      
    } catch (e: any) {
      logger.error('Fetch error:', e);
      
      // Only show error if we have no cached data (Rule 5B-1.5)
      if (!hasCachedData.current) {
        setError(e.message || 'Failed to load library');
      }
    }
  }, [userId, isMobile]);
  
  // Fetch stats from network
  const fetchStats = useCallback(async () => {
    if (!userId) return;
    
    try {
      const [totalRes, readingRes, completedRes] = await Promise.all([
        supabase
          .from('user_library')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('user_library')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gt('progress_percent', 0)
          .lt('progress_percent', 100),
        supabase
          .from('user_library')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('progress_percent', 100),
      ]);
      
      if (!mountedRef.current) return;
      
      const newStats: CachedLibraryStats = {
        total: totalRes.count ?? 0,
        reading: readingRes.count ?? 0,
        completed: completedRes.count ?? 0,
      };
      
      setStats(newStats);
      setCachedStats(newStats);
      
    } catch (e) {
      logger.warn('Failed to fetch stats:', e);
    }
  }, [userId]);
  
  // RULE 5B-1.3: Progressive Hydration - fetch fresh data after cache render
  useEffect(() => {
    if (!userId || !initCompleteRef.current) return;
    
    const hydrateData = async () => {
      setLoadState(hasCachedData.current ? 'hydrating' : 'skeleton');
      
      await Promise.all([
        fetchItems(0, true),
        fetchStats(),
      ]);
      
      if (mountedRef.current) {
        setLoadState('ready');
        markInteractive('Library');
      }
    };
    
    // Defer hydration slightly to not block cache render
    const timeoutId = setTimeout(hydrateData, 50);
    
    return () => clearTimeout(timeoutId);
  }, [userId, fetchItems, fetchStats]);
  
  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !userId) return;
    
    setIsLoadingMore(true);
    await fetchItems(page + 1);
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, userId, fetchItems, page]);
  
  // Refresh (pull-to-refresh)
  const refresh = useCallback(async () => {
    if (!userId) return;
    
    setLoadState('hydrating');
    await Promise.all([
      fetchItems(0, true),
      fetchStats(),
    ]);
    setLoadState('ready');
  }, [userId, fetchItems, fetchStats]);
  
  // Remove item locally
  const removeItem = useCallback((libraryId: string) => {
    setItems(prev => prev.filter(item => item.id !== libraryId));
    setStats(prev => ({
      ...prev,
      total: Math.max(0, prev.total - 1),
    }));
  }, []);
  
  return {
    items,
    stats,
    loadState,
    isLoading: loadState === 'skeleton',
    isHydrating: loadState === 'hydrating',
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    refresh,
    removeItem,
  };
}
