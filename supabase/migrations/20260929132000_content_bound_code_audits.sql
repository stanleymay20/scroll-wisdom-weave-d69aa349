-- Content-hash-bound technical code quality evidence.
--
-- A code audit is evidence about one exact chapter body, not a durable badge.
-- Publication QA accepts it only when content_hash matches the current chapter.
-- Any edit therefore invalidates the old audit without a cleanup trigger.

CREATE TABLE IF NOT EXISTS public.chapter_code_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  chapter_version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  score numeric(4,2) NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('none','low','medium','high')),
  code_block_count integer NOT NULL DEFAULT 0 CHECK (code_block_count >= 0),
  passed boolean NOT NULL DEFAULT false,
  audit_model text NOT NULL,
  audit_prompt_version text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chapter_code_audits_current_lookup
  ON public.chapter_code_audits(chapter_id, content_hash, passed, created_at DESC);

CREATE INDEX IF NOT EXISTS chapter_code_audits_book_created
  ON public.chapter_code_audits(book_id, created_at DESC);

ALTER TABLE public.chapter_code_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chapter_code_audits FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.chapter_code_audits FROM authenticated;
GRANT SELECT ON TABLE public.chapter_code_audits TO authenticated;
GRANT ALL ON TABLE public.chapter_code_audits TO service_role;

DROP POLICY IF EXISTS "Owners can view chapter code audits" ON public.chapter_code_audits;
CREATE POLICY "Owners can view chapter code audits"
  ON public.chapter_code_audits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = chapter_code_audits.book_id
        AND (
          b.creator_id = auth.uid()
          OR b.user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
    )
  );
