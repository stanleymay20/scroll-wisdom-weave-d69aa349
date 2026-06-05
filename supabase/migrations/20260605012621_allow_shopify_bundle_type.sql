-- ============================================================================
-- Add Shopify to allowed export_jobs.bundle_type values.
-- ----------------------------------------------------------------------------
-- The Shopify direct-publish flow was wired in publish-to-shopify and
-- listed in publishing_audit_log/external_publications platform CHECKs
-- (see 20260524222626), but the export_jobs.bundle_type constraint never
-- learned about it. The result: oneClickPublish for Shopify tries to
-- enqueue a bundle with bundle_type='shopify', the Zod enum (now widened)
-- accepts it, but the INSERT into export_jobs blew up on the DB constraint.
-- This patches the constraint and back-fills the rare existing rows.
-- ============================================================================

ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_bundle_type_check;
ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_bundle_type_check
  CHECK (bundle_type = ANY (ARRAY[
    'kdp'::text, 'gumroad'::text, 'shopify'::text,
    'substack'::text, 'patreon'::text, 'etsy'::text
  ]));
