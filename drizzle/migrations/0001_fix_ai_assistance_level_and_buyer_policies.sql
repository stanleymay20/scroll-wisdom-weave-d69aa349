ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS ai_assistance_level text
  CHECK (ai_assistance_level IS NULL OR ai_assistance_level IN ('none','assisted','generated'));

DROP POLICY IF EXISTS "Buyers can read purchased books" ON public.books;
CREATE POLICY "Buyers can read purchased books" ON public.books
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase(auth.uid(), id));

DROP POLICY IF EXISTS "Buyers can read full chapters of purchased books" ON public.chapters;
CREATE POLICY "Buyers can read full chapters of purchased books" ON public.chapters
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase(auth.uid(), book_id));

GRANT EXECUTE ON FUNCTION public.user_owns_book_purchase(uuid, uuid) TO authenticated, service_role;