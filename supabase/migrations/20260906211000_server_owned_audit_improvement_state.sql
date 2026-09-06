-- book_audits is a server-owned artifact. Browser code historically tried to set
-- improvements_applied after rewriting chapters, but authenticated UPDATE rights
-- are now intentionally revoked. Derive that telemetry from the authoritative
-- versioned chapter state instead of reopening audit-table writes.

CREATE OR REPLACE FUNCTION public.sync_book_audit_improvement_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_audit_id uuid;
  v_book_id uuid;
  v_has_versioned_repair boolean;
BEGIN
  -- Recalculate both the old and new audit linkage when a chapter moves between
  -- audit/version states. Matching book_id prevents a chapter from affecting an
  -- unrelated book's audit even if a bad audit UUID were supplied.
  FOR v_audit_id, v_book_id IN
    SELECT x.audit_id, x.book_id
    FROM (
      VALUES
        (OLD.audit_id, OLD.book_id),
        (NEW.audit_id, NEW.book_id)
    ) AS x(audit_id, book_id)
    WHERE x.audit_id IS NOT NULL
    GROUP BY x.audit_id, x.book_id
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.book_id = v_book_id
        AND c.audit_id = v_audit_id
        AND c.previous_content IS NOT NULL
    )
    INTO v_has_versioned_repair;

    UPDATE public.book_audits ba
    SET
      improvements_applied = v_has_versioned_repair,
      improvements_applied_at = CASE
        WHEN v_has_versioned_repair
          THEN COALESCE(ba.improvements_applied_at, clock_timestamp())
        ELSE NULL
      END
    WHERE ba.id = v_audit_id
      AND ba.book_id = v_book_id;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_book_audit_improvement_state()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_book_audit_improvement_state_trigger
  ON public.chapters;

CREATE TRIGGER sync_book_audit_improvement_state_trigger
AFTER UPDATE OF audit_id, previous_content ON public.chapters
FOR EACH ROW
WHEN (
  OLD.audit_id IS DISTINCT FROM NEW.audit_id
  OR OLD.previous_content IS DISTINCT FROM NEW.previous_content
)
EXECUTE FUNCTION public.sync_book_audit_improvement_state();

-- Reconcile historical rows once so the telemetry starts from authoritative state.
UPDATE public.book_audits ba
SET
  improvements_applied = EXISTS (
    SELECT 1
    FROM public.chapters c
    WHERE c.book_id = ba.book_id
      AND c.audit_id = ba.id
      AND c.previous_content IS NOT NULL
  ),
  improvements_applied_at = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.book_id = ba.book_id
        AND c.audit_id = ba.id
        AND c.previous_content IS NOT NULL
    )
      THEN COALESCE(ba.improvements_applied_at, clock_timestamp())
    ELSE NULL
  END;
