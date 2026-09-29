-- Align publication evidence policy with the generation/academic quality contract.
-- Business books routinely contain factual case studies, company histories,
-- market claims and named frameworks; they must be evidence-bound before a
-- generated manuscript can certify.

CREATE OR REPLACE FUNCTION public.book_requires_publication_evidence(p_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      b.category::text = ANY (ARRAY[
        'theology','science','technology','medicine','law','history',
        'philosophy','economics','finance','governance','african_studies',
        'business'
      ]::text[])
      OR lower(COALESCE(b.book_type, '')) = ANY (
        ARRAY['academic','technical','reference','professional']::text[]
      )
    FROM public.books b
    WHERE b.id = p_book_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.book_requires_publication_evidence(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_requires_publication_evidence(uuid)
  TO service_role;
