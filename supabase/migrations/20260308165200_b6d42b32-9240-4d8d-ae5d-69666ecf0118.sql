-- Historical security reconciliation.
-- Policies/RLS are table features. `public_books` is intentionally a
-- SECURITY INVOKER view over `books`, so applying ALTER TABLE/RLS to it is both
-- invalid and unnecessary: access is governed by the underlying books RLS and
-- the view's published-only predicate.
DO $$
DECLARE
  public_books_kind "char";
  audit_log_kind "char";
BEGIN
  SELECT c.relkind
  INTO audit_log_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'security_audit_log';

  IF audit_log_kind IN ('r', 'p') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.security_audit_log';
  END IF;

  SELECT c.relkind
  INTO public_books_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'public_books';

  IF public_books_kind IN ('r', 'p') THEN
    EXECUTE 'ALTER TABLE public.public_books ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Only published books visible" ON public.public_books';
    EXECUTE 'CREATE POLICY "Only published books visible" ON public.public_books FOR SELECT USING (is_published = true)';
  ELSIF public_books_kind = 'v' THEN
    -- The view was recreated earlier with security_invoker=true and an
    -- is_published=true predicate. Leave it a view and let the base books RLS
    -- remain authoritative instead of attempting unsupported view RLS.
    NULL;
  END IF;
END $$;