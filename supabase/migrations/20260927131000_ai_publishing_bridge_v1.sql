-- ScrollLibrary AI Publishing Bridge v1
--
-- External AI systems (ChatGPT, Claude, Gemini, future agents) may propose
-- manuscript changes, but they never receive direct authority to mutate the
-- canonical manuscript. Proposals are versioned, provenance-preserving and
-- accepted through a server-owned transactional RPC.
--
-- This migration is additive only. It does not apply itself to production;
-- Lovable/Supabase deployment remains the controlled migration path.

CREATE TABLE IF NOT EXISTS public.ai_handoff_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  provider text NOT NULL
    CHECK (provider IN ('chatgpt','claude','gemini','other')),
  source_model text,
  operation text NOT NULL DEFAULT 'replace_chapter'
    CHECK (operation IN ('replace_chapter')),
  external_request_id text,
  source_conversation_ref text,
  base_content_hash text NOT NULL
    CHECK (base_content_hash ~ '^[0-9a-f]{64}$'),
  proposed_title text,
  proposed_content text NOT NULL,
  proposed_content_hash text NOT NULL
    CHECK (proposed_content_hash ~ '^[0-9a-f]{64}$'),
  rationale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','rejected','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ai_handoff_proposals_owner_book_idx
  ON public.ai_handoff_proposals(user_id, book_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_handoff_proposals_chapter_idx
  ON public.ai_handoff_proposals(chapter_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ai_handoff_proposals_request_id_uidx
  ON public.ai_handoff_proposals(user_id, provider, external_request_id)
  WHERE external_request_id IS NOT NULL;

ALTER TABLE public.ai_handoff_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_handoff_proposals_owner_read
  ON public.ai_handoff_proposals;
CREATE POLICY ai_handoff_proposals_owner_read
  ON public.ai_handoff_proposals
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = ai_handoff_proposals.book_id
        AND (
          b.user_id = (SELECT auth.uid())
          OR b.creator_id = (SELECT auth.uid())
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.ai_handoff_proposals
  FROM authenticated, anon;
GRANT SELECT ON TABLE public.ai_handoff_proposals TO authenticated;
GRANT ALL ON TABLE public.ai_handoff_proposals TO service_role;


CREATE TABLE IF NOT EXISTS public.chapter_revision_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  proposal_id uuid UNIQUE REFERENCES public.ai_handoff_proposals(id) ON DELETE SET NULL,
  source text NOT NULL
    CHECK (source IN ('external_ai','scrolllibrary','manual')),
  provider text,
  source_model text,
  before_title text NOT NULL,
  after_title text NOT NULL,
  before_content text NOT NULL,
  after_content text NOT NULL,
  before_content_hash text NOT NULL
    CHECK (before_content_hash ~ '^[0-9a-f]{64}$'),
  after_content_hash text NOT NULL
    CHECK (after_content_hash ~ '^[0-9a-f]{64}$'),
  before_version_number integer NOT NULL,
  after_version_number integer NOT NULL,
  change_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chapter_revision_ledger_owner_book_idx
  ON public.chapter_revision_ledger(user_id, book_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chapter_revision_ledger_chapter_idx
  ON public.chapter_revision_ledger(chapter_id, created_at DESC);

ALTER TABLE public.chapter_revision_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_revision_ledger_owner_read
  ON public.chapter_revision_ledger;
CREATE POLICY chapter_revision_ledger_owner_read
  ON public.chapter_revision_ledger
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = chapter_revision_ledger.book_id
        AND (
          b.user_id = (SELECT auth.uid())
          OR b.creator_id = (SELECT auth.uid())
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.chapter_revision_ledger
  FROM authenticated, anon;
GRANT SELECT ON TABLE public.chapter_revision_ledger TO authenticated;
GRANT ALL ON TABLE public.chapter_revision_ledger TO service_role;


-- A lightweight authoring fingerprint used for optimistic concurrency.
-- This is deliberately separate from compute_book_publication_hash(): the
-- publication hash remains the authoritative whole-book certification scope.
CREATE OR REPLACE FUNCTION public.compute_chapter_authoring_hash(p_chapter_id uuid)
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
        c.chapter_number::text,
        COALESCE(c.title,''),
        COALESCE(c.content,''),
        COALESCE(c.version_number,1)::text
      ),
      'sha256'
    ),
    'hex'
  )
  FROM public.chapters c
  WHERE c.id = p_chapter_id;
$$;

REVOKE ALL ON FUNCTION public.compute_chapter_authoring_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_chapter_authoring_hash(uuid)
  TO service_role;

COMMENT ON FUNCTION public.compute_chapter_authoring_hash(uuid) IS
  'Server-owned optimistic-concurrency fingerprint for an editable chapter. External AI clients receive this hash and must submit it with any proposal.';


-- Accept exactly one proposal transactionally. The service-owned function:
--   * proves ownership again,
--   * refuses certified-live manuscript mutation,
--   * rejects stale proposals,
--   * writes an immutable before/after ledger,
--   * increments the chapter version,
--   * and only then marks the proposal accepted.
CREATE OR REPLACE FUNCTION public.accept_ai_handoff_proposal(
  p_user_id uuid,
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.ai_handoff_proposals%ROWTYPE;
  v_chapter public.chapters%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_after public.chapters%ROWTYPE;
  v_current_hash text;
  v_after_hash text;
  v_word_count integer;
BEGIN
  SELECT *
  INTO v_proposal
  FROM public.ai_handoff_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'proposal_not_found'
    );
  END IF;

  SELECT *
  INTO v_book
  FROM public.books
  WHERE id = v_proposal.book_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_proposal.user_id <> p_user_id
     OR NOT (
       v_book.user_id = p_user_id
       OR v_book.creator_id = p_user_id
     ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'forbidden'
    );
  END IF;

  IF v_proposal.status <> 'proposed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'already_decided',
      'status', v_proposal.status
    );
  END IF;

  SELECT *
  INTO v_chapter
  FROM public.chapters
  WHERE id = v_proposal.chapter_id
    AND book_id = v_proposal.book_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'chapter_not_found'
    );
  END IF;

  -- Certified live Publications are immutable by design. A future revision /
  -- edition workflow may fork them, but this bridge must never bypass that
  -- boundary.
  IF v_book.current_publication_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'certified_revision_required',
      'current_publication_id', v_book.current_publication_id
    );
  END IF;

  v_current_hash := public.compute_chapter_authoring_hash(v_chapter.id);

  IF v_current_hash IS DISTINCT FROM v_proposal.base_content_hash THEN
    RETURN pg_catalog.jsonb_build_object(
      'accepted', false,
      'reason', 'stale_base',
      'expected_base_hash', v_proposal.base_content_hash,
      'current_base_hash', v_current_hash
    );
  END IF;

  v_word_count := CASE
    WHEN pg_catalog.btrim(v_proposal.proposed_content) = '' THEN 0
    ELSE pg_catalog.array_length(
      pg_catalog.regexp_split_to_array(
        pg_catalog.btrim(v_proposal.proposed_content),
        E'\\s+'
      ),
      1
    )
  END;

  UPDATE public.chapters
  SET
    title = COALESCE(NULLIF(pg_catalog.btrim(v_proposal.proposed_title), ''), title),
    content = v_proposal.proposed_content,
    word_count = COALESCE(v_word_count, 0),
    is_generated = true,
    version_number = COALESCE(version_number, 1) + 1,
    updated_at = now()
  WHERE id = v_chapter.id
  RETURNING * INTO v_after;

  v_after_hash := public.compute_chapter_authoring_hash(v_after.id);

  INSERT INTO public.chapter_revision_ledger (
    user_id,
    book_id,
    chapter_id,
    proposal_id,
    source,
    provider,
    source_model,
    before_title,
    after_title,
    before_content,
    after_content,
    before_content_hash,
    after_content_hash,
    before_version_number,
    after_version_number,
    change_summary,
    metadata
  )
  VALUES (
    p_user_id,
    v_proposal.book_id,
    v_proposal.chapter_id,
    v_proposal.id,
    'external_ai',
    v_proposal.provider,
    v_proposal.source_model,
    COALESCE(v_chapter.title, ''),
    COALESCE(v_after.title, ''),
    COALESCE(v_chapter.content, ''),
    COALESCE(v_after.content, ''),
    v_current_hash,
    v_after_hash,
    COALESCE(v_chapter.version_number, 1),
    COALESCE(v_after.version_number, 1),
    v_proposal.rationale,
    pg_catalog.jsonb_build_object(
      'source_conversation_ref', v_proposal.source_conversation_ref,
      'external_request_id', v_proposal.external_request_id,
      'proposal_content_hash', v_proposal.proposed_content_hash
    )
  );

  UPDATE public.ai_handoff_proposals
  SET
    status = 'accepted',
    decided_at = now(),
    decided_by = p_user_id
  WHERE id = v_proposal.id;

  RETURN pg_catalog.jsonb_build_object(
    'accepted', true,
    'proposal_id', v_proposal.id,
    'book_id', v_proposal.book_id,
    'chapter_id', v_proposal.chapter_id,
    'version_number', v_after.version_number,
    'chapter_hash', v_after_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ai_handoff_proposal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ai_handoff_proposal(uuid, uuid)
  TO service_role;


CREATE OR REPLACE FUNCTION public.reject_ai_handoff_proposal(
  p_user_id uuid,
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.ai_handoff_proposals%ROWTYPE;
  v_book public.books%ROWTYPE;
BEGIN
  SELECT *
  INTO v_proposal
  FROM public.ai_handoff_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'rejected', false,
      'reason', 'proposal_not_found'
    );
  END IF;

  SELECT *
  INTO v_book
  FROM public.books
  WHERE id = v_proposal.book_id;

  IF NOT FOUND
     OR v_proposal.user_id <> p_user_id
     OR NOT (
       v_book.user_id = p_user_id
       OR v_book.creator_id = p_user_id
     ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'rejected', false,
      'reason', 'forbidden'
    );
  END IF;

  IF v_proposal.status <> 'proposed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'rejected', false,
      'reason', 'already_decided',
      'status', v_proposal.status
    );
  END IF;

  UPDATE public.ai_handoff_proposals
  SET
    status = 'rejected',
    decided_at = now(),
    decided_by = p_user_id
  WHERE id = v_proposal.id;

  RETURN pg_catalog.jsonb_build_object(
    'rejected', true,
    'proposal_id', v_proposal.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_ai_handoff_proposal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_ai_handoff_proposal(uuid, uuid)
  TO service_role;


COMMENT ON TABLE public.ai_handoff_proposals IS
  'External-AI manuscript proposals. Models propose; only ScrollLibrary server authority can accept/reject and mutate canonical content.';

COMMENT ON TABLE public.chapter_revision_ledger IS
  'Immutable before/after provenance ledger for canonical chapter revisions.';
