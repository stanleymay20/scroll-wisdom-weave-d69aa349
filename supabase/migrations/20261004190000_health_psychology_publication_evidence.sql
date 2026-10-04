-- Converge the persisted category vocabulary with the public authoring surface,
-- then extend factual-domain publication evidence governance to Health and Psychology.
--
-- ScrollLibrary has two legitimate historical database shapes:
--   1) fresh/rebuilt databases where books.category is public.book_category;
--   2) the long-lived Lovable-controlled production database where books.category is text.
--
-- Never assume the enum exists. If it does, extend it. If it does not, leave the
-- text-backed production column untouched. The evidence function compares through
-- ::text and therefore works correctly against both shapes.

DO $$
BEGIN
  IF to_regtype('public.book_category') IS NOT NULL THEN
    EXECUTE 'ALTER TYPE public.book_category ADD VALUE IF NOT EXISTS ''health''';
    EXECUTE 'ALTER TYPE public.book_category ADD VALUE IF NOT EXISTS ''psychology''';
  END IF;
END
$$;

-- The dynamic material-claim policy catches many quantified/legal claims, but
-- medically/psychologically relevant prose can make consequential claims without
-- a date, percentage or currency cue. Preserve the existing dynamic-material-claim
-- semantics and add the newly public governed categories.

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
        'theology','science','technology','medicine','health','psychology','law','history',
        'philosophy','economics','finance','governance','african_studies',
        'business'
      ]::text[])
      OR lower(COALESCE(b.book_type, '')) = ANY (
        ARRAY['academic','technical','reference','professional']::text[]
      )
      OR (
        lower(COALESCE(b.book_type, 'text')) <> ALL (
          ARRAY['fiction','comic','children']::text[]
        )
        AND EXISTS (
          SELECT 1
          FROM public.chapters c
          WHERE c.book_id = b.id
            AND COALESCE(c.content, '') ~* (
              '(acquir(e|es|ed|ing)|acquisition|merg(e|es|ed|er)|' ||
              'rais(e|es|ed|ing)|funding round|valu(e|es|ed|ation)|sold to|' ||
              'bought by|partner(ed|ship)|announc(e|es|ed)|' ||
              '(^|[^[:alnum:]_])([€£$][[:space:]]*[0-9]|[0-9]+([.,][0-9]+)?[[:space:]]*%|' ||
              '20[0-9]{2}|§[[:space:]]*[0-9]+)|' ||
              '(^|[^[:alnum:]_])(law|act|regulation|directive|statute|ordinance|' ||
              'gdpr|ai act|data act|nis2|cyber resilience act|blue card|' ||
              'minimum wage|share capital|legal requirement|required by law|' ||
              'mandatory|prohibited|fine|penalty|threshold)([^[:alnum:]_]|$))'
            )
        )
      )
    FROM public.books b
    WHERE b.id = p_book_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.book_requires_publication_evidence(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_requires_publication_evidence(uuid)
  TO service_role;
