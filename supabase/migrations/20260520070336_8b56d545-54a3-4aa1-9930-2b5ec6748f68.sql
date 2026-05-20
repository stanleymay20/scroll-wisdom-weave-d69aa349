
-- Allow public read access to books when an active public_listing exists
CREATE POLICY "Books viewable via public listing"
ON public.books FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.public_listings pl
    WHERE pl.book_id = books.id AND pl.is_public = true
  )
);

-- Allow public read access to chapters within sample window when listing is public
CREATE POLICY "Sample chapters viewable via public listing"
ON public.chapters FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.public_listings pl
    WHERE pl.book_id = chapters.book_id
      AND pl.is_public = true
      AND chapters.chapter_number <= pl.sample_chapters
  )
);
