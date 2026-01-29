/**
 * CONTRACT 5B-3: Reader Entry Speed
 * 
 * Hook for skeleton-first, cache-first reader loading.
 * Single source of truth for Reader component data.
 * 
 * RULES:
 * - 5B-3.1: Instant Shell - Reader visible in ≤100ms
 * - 5B-3.2: Cache-Primed Entry - Prefill from route state
 * - 5B-3.3: Progressive Hydration - skeleton → cached → hydrating → ready
 * - 5B-3.4: Zero Layout Shift
 * - 5B-3.5: Offline Truth
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import {
  getCachedChapterByKey,
  setCachedChapter,
  generateContentPreview,
  CachedChapterDetail,
  ReaderLoadState,
  normalizeCacheEntry,
} from '@/lib/chapterDetailCache';

const logger = createLogger('useReaderData');

interface BookMeta {
  id: string;
  title: string;
  total_chapters: number | null;
  language: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  word_count: number | null;
  academic_mode?: boolean;
  citation_style?: string;
  chapter_references?: any[];
  research_metadata?: any;
}

interface RouteState {
  chapterId?: string;
  bookId?: string;
  chapterNumber?: number;
  title?: string;
  wordCount?: number | null;
  content?: string | null;
}

interface UseReaderDataOptions {
  bookId: string | undefined;
  chapterNumber: number;
}

interface UseReaderDataReturn {
  book: BookMeta | null;
  chapter: ChapterData | null;
  previewContent: string;
  loadState: ReaderLoadState;
  isLoading: boolean;
  isHydrating: boolean;
  resumePosition: number;
  error: string | null;
  userId: string | null;
  refresh: () => Promise<void>;
}

export function useReaderData({ bookId, chapterNumber }: UseReaderDataOptions): UseReaderDataReturn {
  const location = useLocation();
  
  // State
  const [book, setBook] = useState<BookMeta | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loadState, setLoadState] = useState<ReaderLoadState>('skeleton');
  const [resumePosition, setResumePosition] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasNetworkData, setHasNetworkData] = useState(false);
  
  // Refs
  const hasFetched = useRef(false);
  const mountedRef = useRef(true);

  // RULE 5B-3.2: Check for route state (cache-primed entry) - INSTANT
  useEffect(() => {
    const routeState = location.state as RouteState | undefined;
    
    if (routeState?.bookId === bookId && routeState?.chapterNumber === chapterNumber) {
      logger.debug('Using route state for instant render');
      
      // Set book meta if available
      if (routeState.bookId) {
        // We'll get full book data from network, but we can show basic info
        setBook(prev => prev || {
          id: routeState.bookId!,
          title: '', // Will be filled from network
          total_chapters: null,
          language: null,
        });
      }
      
      // Set chapter meta for instant display
      if (routeState.chapterId) {
        setChapter({
          id: routeState.chapterId,
          chapter_number: routeState.chapterNumber || chapterNumber,
          title: routeState.title || '',
          content: routeState.content || null,
          word_count: routeState.wordCount || null,
        });
        
        if (routeState.content) {
          setPreviewContent(routeState.content);
          setLoadState('cached');
        }
      }
    }
  }, [location.state, bookId, chapterNumber]);

  // RULE 5B-3.1 & 5B-3.3: Load cached data immediately, then hydrate
  const loadData = useCallback(async () => {
    if (!bookId) return;
    
    const startTime = performance.now();
    logger.debug(`Loading reader data for book ${bookId}, chapter ${chapterNumber}`);
    
    // STEP 1: Check auth (non-blocking, for progress tracking)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mountedRef.current) {
        setUserId(session?.user?.id ?? null);
      }
    });
    
    // STEP 2: Try cache first using deterministic key (INSTANT - <100ms)
    // ISSUE 1 FIX: NO network call here - use bookId + chapterNumber directly
    const cached = await getCachedChapterByKey(bookId, chapterNumber);
    
    if (cached && mountedRef.current) {
      setChapter({
        id: cached.chapterId,
        chapter_number: cached.chapterNumber,
        title: cached.title,
        content: cached.fullContent,
        word_count: cached.wordCount,
        academic_mode: cached.academicMode ?? undefined,
        citation_style: cached.citationStyle ?? undefined,
        chapter_references: (cached.chapterReferences as any[]) ?? [],
        research_metadata: cached.researchMetadata ?? {},
      });
      setPreviewContent(cached.contentPreview);
      setResumePosition(cached.lastReadPosition);
      setLoadState('hydrating');
      
      logger.debug(`Cache loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
    }
    
    // STEP 3: Check online status
    const isOnline = navigator.onLine;
    if (!isOnline) {
      const hasCached = !!chapter?.content || !!previewContent;
      if (hasCached) {
        setLoadState('offline-with-cache');
      } else {
        setLoadState('offline-empty');
        setError('You are offline and this chapter is not cached');
      }
      return;
    }

    // STEP 4: Fetch fresh data (background if cached)
    try {
      // Fetch book
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('id, title, total_chapters, language')
        .eq('id', bookId)
        .single();

      if (bookError) {
        if (!chapter) {
          setError('Book not found');
        }
        return;
      }

      if (mountedRef.current) {
        setBook(bookData);
      }

      // Fetch chapter
      const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .eq('chapter_number', chapterNumber)
        .single();

      if (chapterError) {
        if (!chapter) {
          setError('Chapter not found');
        }
        return;
      }

      if (!mountedRef.current) return;

      const processedChapter: ChapterData = {
        ...chapterData,
        chapter_references: Array.isArray(chapterData.chapter_references)
          ? chapterData.chapter_references
          : [],
        research_metadata: (chapterData.research_metadata as Record<string, any>) || {},
      };
      
      setChapter(processedChapter);
      setHasNetworkData(true);
      
      // STEP 5: Update cache for next time (normalized)
      await setCachedChapter({
        chapterId: chapterData.id,
        bookId: bookId,
        chapterNumber: chapterData.chapter_number,
        title: chapterData.title,
        wordCount: chapterData.word_count,
        contentPreview: generateContentPreview(chapterData.content),
        fullContent: chapterData.content,
        lastReadPosition: resumePosition,
        isGenerated: chapterData.is_generated || false,
        academicMode: chapterData.academic_mode ?? null,
        citationStyle: chapterData.citation_style ?? null,
        chapterReferences: Array.isArray(chapterData.chapter_references) ? chapterData.chapter_references : null,
        researchMetadata: (chapterData.research_metadata as Record<string, unknown>) ?? null,
      });

      if (mountedRef.current) {
        setLoadState('ready');
        setError(null);
      }

      logger.debug(`Reader fully loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
    } catch (err) {
      logger.error('Error fetching reader data:', err);
      if (!chapter && mountedRef.current) {
        setError('Failed to load chapter');
      }
    }
  }, [bookId, chapterNumber, chapter, previewContent, resumePosition]);

  // Initial load - reset state and fetch on every chapter/book change
  useEffect(() => {
    mountedRef.current = true;
    
    // Always reset and reload when bookId or chapterNumber changes
    if (bookId) {
      // Reset state for fresh chapter load
      setLoadState('skeleton');
      setError(null);
      setHasNetworkData(false);
      hasFetched.current = true;
      loadData();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [bookId, chapterNumber]); // Note: removed loadData to prevent infinite loops

  // Online/offline listener
  useEffect(() => {
    const handleOnline = () => {
      if (loadState === 'offline-with-cache' || loadState === 'offline-empty') {
        loadData();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadState, loadData]);

  // Refresh handler
  const refresh = useCallback(async () => {
    hasFetched.current = false;
    setLoadState(chapter ? 'hydrating' : 'skeleton');
    await loadData();
  }, [loadData, chapter]);

  return {
    book,
    chapter,
    previewContent,
    loadState,
    isLoading: loadState === 'skeleton',
    isHydrating: loadState === 'hydrating',
    resumePosition,
    error,
    userId,
    refresh,
  };
}
