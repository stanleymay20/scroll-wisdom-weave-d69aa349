
CREATE OR REPLACE FUNCTION public.book_has_public_listing(_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.public_listings pl WHERE pl.book_id = _book_id AND pl.is_public = true)
$$;

REVOKE EXECUTE ON FUNCTION public.book_has_public_listing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_has_public_listing(uuid) TO authenticated, anon;

DROP POLICY IF EXISTS "Books viewable via public listing" ON public.books;
CREATE POLICY "Books viewable via public listing"
ON public.books FOR SELECT
USING (public.book_has_public_listing(id));
