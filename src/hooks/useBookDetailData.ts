/**
 * CONTRACT 5B-2: Book Detail Entry Speed
 * 
 * Hook for skeleton-first, cache-first book detail loading.
 * 
 * RULES:
 * - 5B-2.1: Instant Shell - Navigate immediately with cached data
 * - 5B-2.2: Cache-Primed Entry - Prefill from library cache or route state
 * - 5B-2.3: Progressive Hydration - skeleton → cached → hydrating → ready
 * - 5B-2.4: Zero Layout Shift
 * - 5B-2.5: Offline Truth
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import {
  getCachedBookDetail,
  setCachedBookDetail,
  determineBookDetailLoadState,
  CachedBookDetail,
  CachedChapter,
  CachedBookWithChapters,
  BookDetailLoadState,
} from '@/lib/bookDetailCache';

const logger = createLogger('useBookDetailData');

interface BookData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  author_ai_agent: string | null;
  total_chapters: number | null;
  cover_image_url: string | null;
  is_published: boolean | null;
  creator_id: string | null;
  user_id: string;
  language: string | null;
  book_type: string | null;
  source_type: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
  is_generated: boolean | null;
  content: string | null;
}

interface UseBookDetailDataOptions {
  bookId: string | undefined;
}

interface UseBookDetailDataReturn {
  book: BookData | null;
  chapters: ChapterData[];
  loadState: BookDetailLoadState;
  isLoading: boolean;
  isHydrating: boolean;
  error: string | null;
  user: any | null;
  isSaved: boolean;
  setIsSaved: (saved: boolean) => void;
  refresh: () => Promise<void>;
  updateChapter: (chapterId: string, updates: Partial<ChapterData>) => void;
  setBook: React.Dispatch<React.SetStateAction<BookData | null>>;
  setChapters: React.Dispatch<React.SetStateAction<ChapterData[]>>;
}

export function useBookDetailData({ bookId }: UseBookDetailDataOptions): UseBookDetailDataReturn {
  const location = useLocation();
  
  // State
  const [book, setBook] = useState<BookData | null>(null);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [loadState, setLoadState] = useState<BookDetailLoadState>('skeleton');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [hasNetworkData, setHasNetworkData] = useState(false);
  
  // Refs
  const hasFetched = useRef(false);
  const mountedRef = useRef(true);

  // RULE 5B-2.2: Check for route state (cache-primed entry)
  useEffect(() => {
    const routeState = location.state as CachedBookWithChapters | undefined;
    
    if (routeState?.book && routeState.book.id === bookId) {
      logger.debug('Using route state for instant render');
      setBook({
        id: routeState.book.id,
        title: routeState.book.title,
        description: routeState.book.description,
        category: routeState.book.category,
        author_ai_agent: routeState.book.author_ai_agent,
        total_chapters: routeState.book.total_chapters,
        cover_image_url: routeState.book.cover_image_url,
        is_published: routeState.book.is_published,
        creator_id: routeState.book.creator_id,
        user_id: (routeState.book as any).user_id ?? '',
        language: routeState.book.language,
        book_type: routeState.book.book_type,
        source_type: (routeState.book as any).source_type ?? null,
      });
      setLoadState('cached');
    }
  }, [location.state, bookId]);

  // RULE 5B-2.1 & 5B-2.3: Load cached data immediately, then hydrate
  const loadData = useCallback(async () => {
    if (!bookId) return;
    
    const startTime = performance.now();
    logger.debug(`Loading book detail for ${bookId}`);
    
    // STEP 1: Try cache first (INSTANT - <100ms)
    const cached = await getCachedBookDetail(bookId);
    
    if (cached && mountedRef.current) {
      setBook({
        id: cached.book.id,
        title: cached.book.title,
        description: cached.book.description,
        category: cached.book.category,
        author_ai_agent: cached.book.author_ai_agent,
        total_chapters: cached.book.total_chapters,
        cover_image_url: cached.book.cover_image_url,
        is_published: cached.book.is_published,
        creator_id: cached.book.creator_id,
        user_id: (cached.book as any).user_id ?? '',
        language: cached.book.language,
        book_type: cached.book.book_type,
        source_type: (cached.book as any).source_type ?? null,
      });
      
      if (cached.chapters.length > 0) {
        setChapters(cached.chapters.map(ch => ({
          ...ch,
          content: null, // Content not cached for size
        })));
      }
      
      setLoadState('hydrating');
      logger.debug(`Cache loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
    }
    
    // STEP 2: Check online status
    const isOnline = navigator.onLine;
    if (!isOnline) {
      if (cached) {
        setLoadState('offline-with-cache');
      } else {
        setLoadState('offline-empty');
        setError('You are offline and this book is not cached');
      }
      return;
    }

    // STEP 3: Fetch fresh data (background if cached)
    try {
      // Get current user (non-blocking)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (mountedRef.current) {
        setUser(currentUser);
      }

      // Fetch book
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) {
        if (!cached) {
          setError('Book not found');
          setLoadState('skeleton');
        }
        return;
      }

      if (!mountedRef.current) return;

      setBook(bookData);
      setHasNetworkData(true);

      // Fetch chapters
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, word_count, is_generated, content')
        .eq('book_id', bookId)
        .order('chapter_number');

      if (!chaptersError && chaptersData && mountedRef.current) {
        setChapters(chaptersData);
      }

      // Check if book is in user's library
      if (currentUser && mountedRef.current) {
        const { data: libraryItem } = await supabase
          .from('user_library')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('book_id', bookId)
          .single();

        setIsSaved(!!libraryItem);
      }

      // STEP 4: Update cache for next time
      await setCachedBookDetail(bookId, {
        book: {
          id: bookData.id,
          title: bookData.title,
          description: bookData.description,
          category: bookData.category,
          cover_image_url: bookData.cover_image_url,
          total_chapters: bookData.total_chapters,
          book_type: bookData.book_type,
          language: bookData.language,
          is_published: bookData.is_published,
          creator_id: bookData.creator_id,
          author_ai_agent: bookData.author_ai_agent,
        },
        chapters: (chaptersData || []).map(ch => ({
          id: ch.id,
          chapter_number: ch.chapter_number,
          title: ch.title,
          word_count: ch.word_count,
          is_generated: ch.is_generated,
        })),
        lastUpdated: Date.now(),
      });

      if (mountedRef.current) {
        setLoadState('ready');
        setError(null);
      }

      logger.debug(`Book detail fully loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
    } catch (err) {
      logger.error('Error fetching book detail:', err);
      if (!cached && mountedRef.current) {
        setError('Failed to load book');
      }
    }
  }, [bookId]);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    hasFetched.current = false;

    if (bookId && !hasFetched.current) {
      hasFetched.current = true;
      loadData();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [bookId, loadData]);

  // Realtime subscription for chapter updates
  useEffect(() => {
    if (!bookId) return;

    const channel = supabase
      .channel(`chapter-updates-${bookId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chapters',
          filter: `book_id=eq.${bookId}`
        },
        (payload) => {
          const updatedChapter = payload.new as ChapterData;
          setChapters(prev => prev.map(ch => 
            ch.id === updatedChapter.id ? { ...ch, ...updatedChapter } : ch
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookId]);

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

  // Update single chapter helper
  const updateChapter = useCallback((chapterId: string, updates: Partial<ChapterData>) => {
    setChapters(prev => prev.map(ch =>
      ch.id === chapterId ? { ...ch, ...updates } : ch
    ));
  }, []);

  // Refresh handler
  const refresh = useCallback(async () => {
    hasFetched.current = false;
    setLoadState(book ? 'hydrating' : 'skeleton');
    await loadData();
  }, [loadData, book]);

  return {
    book,
    chapters,
    loadState,
    isLoading: loadState === 'skeleton',
    isHydrating: loadState === 'hydrating',
    error,
    user,
    isSaved,
    setIsSaved,
    refresh,
    updateChapter,
    setBook,
    setChapters,
  };
}
