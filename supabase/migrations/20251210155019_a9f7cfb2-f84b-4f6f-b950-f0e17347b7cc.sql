-- Add creator_id to books table to track ownership
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES auth.users(id);

-- Update default for is_published to false (private by default)
ALTER TABLE public.books ALTER COLUMN is_published SET DEFAULT false;

-- Update existing books to be private (set is_published to false)
UPDATE public.books SET is_published = false WHERE is_published = true;

-- Assign existing books to the user who has them in their library
UPDATE public.books b
SET creator_id = (
  SELECT ul.user_id 
  FROM public.user_library ul 
  WHERE ul.book_id = b.id 
  LIMIT 1
)
WHERE b.creator_id IS NULL;

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Anyone can view published books" ON public.books;

-- Create new policies for books

-- Creators can view their own books (published or not)
CREATE POLICY "Creators can view their own books"
ON public.books
FOR SELECT
USING (auth.uid() = creator_id);

-- Anyone can view published books
CREATE POLICY "Anyone can view published books"
ON public.books
FOR SELECT
USING (is_published = true);

-- Creators can update their own books
CREATE POLICY "Creators can update their own books"
ON public.books
FOR UPDATE
USING (auth.uid() = creator_id);

-- Creators can delete their own books
CREATE POLICY "Creators can delete their own books"
ON public.books
FOR DELETE
USING (auth.uid() = creator_id);

-- Authenticated users can create books
CREATE POLICY "Authenticated users can create books"
ON public.books
FOR INSERT
WITH CHECK (auth.uid() = creator_id);

-- Update chapters policy to allow viewing chapters of own books
DROP POLICY IF EXISTS "Anyone can view chapters of published books" ON public.chapters;

CREATE POLICY "View chapters of published books"
ON public.chapters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.is_published = true
  )
);

CREATE POLICY "Creators can view their book chapters"
ON public.chapters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.creator_id = auth.uid()
  )
);

-- Creators can insert chapters to their books
CREATE POLICY "Creators can insert chapters"
ON public.chapters
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.creator_id = auth.uid()
  )
);

-- Creators can update their book chapters
CREATE POLICY "Creators can update chapters"
ON public.chapters
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.creator_id = auth.uid()
  )
);

-- Creators can delete their book chapters
CREATE POLICY "Creators can delete chapters"
ON public.chapters
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.id = chapters.book_id 
    AND books.creator_id = auth.uid()
  )
);