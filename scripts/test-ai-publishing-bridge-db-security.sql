-- AI Publishing Bridge authority contract.
--
-- External AI handoffs are deliberately proposal-only. Browser roles may read
-- their own proposal/revision history through RLS, but canonicalization and
-- ledger writes remain service-owned.

BEGIN;
SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'ai_handoff_proposals';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ai_handoff_proposals RLS is not enabled';
  END IF;

  SELECT relrowsecurity INTO v_rls
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'chapter_revision_ledger';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'chapter_revision_ledger RLS is not enabled';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.ai_handoff_proposals', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost read access to own AI handoff proposals';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.chapter_revision_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost read access to own chapter revision ledger';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.ai_handoff_proposals', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.ai_handoff_proposals', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.ai_handoff_proposals', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can bypass AI proposal server authority';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.chapter_revision_ledger', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.chapter_revision_ledger', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.chapter_revision_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can mutate immutable chapter revision ledger';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.accept_ai_handoff_proposal(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can call accept_ai_handoff_proposal directly';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.reject_ai_handoff_proposal(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can call reject_ai_handoff_proposal directly';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.compute_chapter_authoring_hash(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can call server-owned chapter authoring hash directly';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.accept_ai_handoff_proposal(uuid,uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.reject_ai_handoff_proposal(uuid,uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.compute_chapter_authoring_hash(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role lost AI Publishing Bridge authority';
  END IF;

  RAISE NOTICE 'ALL AI PUBLISHING BRIDGE AUTHORITY ASSERTIONS PASSED';
END
$$;

ROLLBACK;
