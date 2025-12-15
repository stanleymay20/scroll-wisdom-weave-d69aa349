-- Add language column to books table to store the book's generation language
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Add comment explaining the column
COMMENT ON COLUMN public.books.language IS 'The language code for generated content (en, fr, de, es, ar, sw, pt)';