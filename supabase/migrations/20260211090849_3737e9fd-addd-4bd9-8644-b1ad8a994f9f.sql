-- Add performance indexes for Library queries
CREATE INDEX IF NOT EXISTS idx_books_is_published ON public.books (is_published);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books (user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON public.user_library (user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_created_at ON public.user_library (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_library_user_book ON public.user_library (user_id, book_id);