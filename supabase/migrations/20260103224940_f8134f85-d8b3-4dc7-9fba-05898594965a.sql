-- A) AUTHOR / PUBLISHER SYSTEM
-- Add author mode and display fields to books table

ALTER TABLE public.books 
ADD COLUMN IF NOT EXISTS author_mode TEXT CHECK (author_mode IN ('user_name', 'pen_name', 'ai', 'hidden')) DEFAULT 'ai',
ADD COLUMN IF NOT EXISTS author_display_name TEXT,
ADD COLUMN IF NOT EXISTS pen_name TEXT,
ADD COLUMN IF NOT EXISTS publisher_imprint TEXT;

-- Backfill existing rows: set author_mode='ai' and author_display_name from author_ai_agent if not set
UPDATE public.books 
SET 
  author_mode = COALESCE(author_mode, 'ai'),
  author_display_name = COALESCE(author_display_name, author_ai_agent, 'ScrollAuthorGPT')
WHERE author_mode IS NULL OR author_display_name IS NULL;

-- B) Create book-assets storage bucket for comic panels and covers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-assets', 
  'book-assets', 
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for book-assets bucket
-- Anyone can view public assets
CREATE POLICY "Public read access for book assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-assets');

-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload book assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'book-assets' 
  AND auth.uid() IS NOT NULL
);

-- Users can update their own assets
CREATE POLICY "Users can update own book assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'book-assets' 
  AND auth.uid() IS NOT NULL
);

-- Users can delete their own assets
CREATE POLICY "Users can delete own book assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'book-assets' 
  AND auth.uid() IS NOT NULL
);

-- F) PERFORMANCE INDEXES
-- Add indexes for library performance optimization
CREATE INDEX IF NOT EXISTS idx_books_creator_id ON public.books(creator_id);
CREATE INDEX IF NOT EXISTS idx_chapters_book_id_number ON public.chapters(book_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_user_library_user_book ON public.user_library(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_user_library_created_at ON public.user_library(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_is_published ON public.books(is_published) WHERE is_published = true;

-- Add comic_metadata column to chapters for panel tracking
ALTER TABLE public.chapters
ADD COLUMN IF NOT EXISTS comic_metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN public.chapters.comic_metadata IS 'Stores comic panel metadata: panel_count, panel_urls[], style, seed';