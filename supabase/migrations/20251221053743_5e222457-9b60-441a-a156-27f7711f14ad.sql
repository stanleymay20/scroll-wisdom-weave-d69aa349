ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS book_type text NOT NULL DEFAULT 'text';

UPDATE public.books
SET book_type = 'text'
WHERE book_type IS NULL;