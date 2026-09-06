-- Final publication trust-boundary cutover.
--
-- All publication workflow mutations are now performed by service-role Edge
-- Functions. Authenticated browsers retain read-only progress access under RLS,
-- but no longer have any mutation privilege on generation_jobs.
--
-- All publication attestation producers use the scope-bound RPC. Retain the
-- legacy unbound function definition for migration/history compatibility, but
-- revoke its execution from application roles so it cannot be used accidentally.

REVOKE ALL ON TABLE public.generation_jobs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (
  status,
  current_chapter,
  error_code,
  error_message,
  completed_at
) ON TABLE public.generation_jobs FROM PUBLIC, anon, authenticated;

-- Remove the now-dead mutation policy as defense in depth: a future accidental
-- UPDATE grant must not silently re-enable owner-side workflow mutation.
DROP POLICY IF EXISTS "Users can update own generation jobs"
  ON public.generation_jobs;

-- Preserve read-only owner/admin workflow visibility and server authority.
GRANT SELECT ON TABLE public.generation_jobs TO authenticated;
GRANT ALL ON TABLE public.generation_jobs TO service_role;

REVOKE ALL ON FUNCTION public.record_publication_gate_attestation(
  uuid, uuid, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- Reassert the intended bound-API contract explicitly.
REVOKE ALL ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) TO service_role;
