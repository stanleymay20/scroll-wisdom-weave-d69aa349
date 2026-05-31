CREATE INDEX IF NOT EXISTS idx_books_user_created ON public.books (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_creator_created ON public.books (creator_id, created_at DESC);
ANALYZE public.books;