-- Server-owned publication certification baseline.
--
-- Publication readiness must be derived from trusted artifacts that are bound to
-- the exact manuscript/chapter state inspected. Browser roles can read their own
-- certification evidence but cannot create or mutate it.

-- Existing Chief Editor and deterministic QA artifacts are server-authored.
-- Keep owner read access, but remove browser mutation capability at the grant
-- layer so permissive historical RLS policies cannot make these records forgeable.
REVOKE ALL ON TABLE public.book_audits FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.book_audits FROM authenticated;
GRANT SELECT ON TABLE public.book_audits TO authenticated;
GRANT ALL ON TABLE public.book_audits TO service_role;

REVOKE ALL ON TABLE public.book_qa_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.book_qa_reports FROM authenticated;
GRANT SELECT ON TABLE public.book_qa_reports TO authenticated;
GRANT ALL ON TABLE public.book_qa_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.publication_gate_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  gate text NOT NULL
    CHECK (gate IN ('editorial', 'evidence', 'qa', 'structural', 'production', 'rights')),
  scope text NOT NULL DEFAULT 'book'
    CHECK (scope IN ('book', 'chapter')),
  status text NOT NULL
    CHECK (status IN ('passed', 'blocked')),
  scope_hash text NOT NULL
    CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  artifact jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_gate_scope_consistency CHECK (
    (scope = 'book' AND chapter_id IS NULL)
    OR (scope = 'chapter' AND chapter_id IS NOT NULL)
  )
);

ALTER TABLE public.publication_gate_attestations ENABLE ROW LEVEL SECURITY;

-- Supabase projects may grant broad public-schema privileges by default.
-- Explicitly opt this trust ledger into read-only browser access.
REVOKE ALL ON TABLE public.publication_gate_attestations FROM anon, authenticated;
GRANT SELECT ON TABLE public.publication_gate_attestations TO authenticated;
GRANT ALL ON TABLE public.publication_gate_attestations TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publication_gate_attestations'
      AND policyname = 'Owners can view publication gate attestations'
  ) THEN
    CREATE POLICY "Owners can view publication gate attestations"
      ON public.publication_gate_attestations
      FOR SELECT TO authenticated
      USING (
        user_id = (SELECT auth.uid())
        OR public.has_role((SELECT auth.uid()), 'admin')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS publication_gate_attestations_book_gate_created_idx
  ON public.publication_gate_attestations(book_id, gate, created_at DESC);

CREATE INDEX IF NOT EXISTS publication_gate_attestations_chapter_gate_created_idx
  ON public.publication_gate_attestations(chapter_id, gate, created_at DESC)
  WHERE chapter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS publication_gate_attestations_hash_idx
  ON public.publication_gate_attestations(scope_hash);

-- Exact-state chapter fingerprint used by evidence attestations.
CREATE OR REPLACE FUNCTION public.compute_chapter_publication_hash(p_chapter_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        E'\x1f',
        c.id::text,
        c.book_id::text,
        c.chapter_number::text,
        COALESCE(c.title, ''),
        COALESCE(c.content, ''),
        COALESCE(c.is_generated, false)::text,
        COALESCE(c.version_number, 1)::text,
        COALESCE(c.academic_mode, false)::text,
        COALESCE(c.citation_style, ''),
        COALESCE(c.chapter_references, '[]'::jsonb)::text
      ),
      'sha256'
    ),
    'hex'
  )
  FROM public.chapters c
  WHERE c.id = p_chapter_id;
$$;

REVOKE ALL ON FUNCTION public.compute_chapter_publication_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_chapter_publication_hash(uuid)
  TO service_role;

-- Whole-publication fingerprint. This intentionally includes publication-relevant
-- book metadata plus ordered chapter content/references, so later edits make an
-- earlier attestation stale without trusting the browser to announce the edit.
CREATE OR REPLACE FUNCTION public.compute_book_publication_hash(p_book_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH book_payload AS (
    SELECT pg_catalog.concat_ws(
      E'\x1f',
      b.id::text,
      COALESCE(b.title, ''),
      COALESCE(b.description, ''),
      b.category::text,
      COALESCE(b.book_type, ''),
      COALESCE(b.language, ''),
      COALESCE(b.cover_image_url, ''),
      COALESCE(b.author_mode, ''),
      COALESCE(b.author_display_name, ''),
      COALESCE(b.pen_name, ''),
      COALESCE(b.publisher_imprint, '')
    ) AS payload
    FROM public.books b
    WHERE b.id = p_book_id
  ),
  chapter_payload AS (
    SELECT pg_catalog.string_agg(
      pg_catalog.concat_ws(
        E'\x1f',
        c.id::text,
        c.chapter_number::text,
        COALESCE(c.title, ''),
        COALESCE(c.content, ''),
        COALESCE(c.is_generated, false)::text,
        COALESCE(c.version_number, 1)::text,
        COALESCE(c.academic_mode, false)::text,
        COALESCE(c.citation_style, ''),
        COALESCE(c.chapter_references, '[]'::jsonb)::text
      ),
      E'\x1e' ORDER BY c.chapter_number, c.id
    ) AS payload
    FROM public.chapters c
    WHERE c.book_id = p_book_id
  )
  SELECT pg_catalog.encode(
    extensions.digest(
      bp.payload || E'\x1d' || COALESCE(cp.payload, ''),
      'sha256'
    ),
    'hex'
  )
  FROM book_payload bp
  CROSS JOIN chapter_payload cp;
$$;

REVOKE ALL ON FUNCTION public.compute_book_publication_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_book_publication_hash(uuid)
  TO service_role;
