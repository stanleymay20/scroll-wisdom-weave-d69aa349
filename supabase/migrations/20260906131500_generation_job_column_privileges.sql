-- generation_jobs is workflow telemetry. Authenticated clients may update only
-- the narrow self-owned workflow/error fields still used by the current UI.
-- Identity, book binding, expected totals, metadata, and origin timestamps are
-- service-owned and must not be browser-writable.

REVOKE UPDATE ON TABLE public.generation_jobs FROM authenticated;

GRANT UPDATE (
  status,
  current_chapter,
  error_code,
  error_message,
  completed_at
) ON TABLE public.generation_jobs TO authenticated;

-- SELECT remains available under RLS for owner progress/resume UI.
GRANT SELECT ON TABLE public.generation_jobs TO authenticated;
GRANT ALL ON TABLE public.generation_jobs TO service_role;
