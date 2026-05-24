-- publishing_audit_log
CREATE TABLE IF NOT EXISTS public.publishing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid,
  listing_id uuid,
  platform text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'publish_started','publish_completed','publish_failed',
    'sync_started','sync_completed','sync_failed',
    'token_revoked','token_expired',
    'external_updated','external_deleted','external_unpublished'
  )),
  external_id text,
  external_url text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error')),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_audit_user ON public.publishing_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_audit_book ON public.publishing_audit_log (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_audit_platform ON public.publishing_audit_log (platform, created_at DESC);

ALTER TABLE public.publishing_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own publishing audit log"
  ON public.publishing_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all publishing audit log"
  ON public.publishing_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role bypasses RLS; no insert/update/delete policies for users.

-- external_publications: allow shopify + dirty sync_state
ALTER TABLE public.external_publications DROP CONSTRAINT IF EXISTS external_publications_platform_check;
ALTER TABLE public.external_publications
  ADD CONSTRAINT external_publications_platform_check
  CHECK (platform IN ('kdp','gumroad','shopify','substack','patreon','etsy','other'));

ALTER TABLE public.external_publications DROP CONSTRAINT IF EXISTS external_publications_sync_state_check;
ALTER TABLE public.external_publications
  ADD CONSTRAINT external_publications_sync_state_check
  CHECK (sync_state IN ('manual','auto','syncing','error','dirty'));

-- Refresh idempotency partial index to include shopify (already does, but keep explicit)
DROP INDEX IF EXISTS public.uniq_external_pub_book_platform;
CREATE UNIQUE INDEX uniq_external_pub_book_platform
  ON public.external_publications (book_id, platform)
  WHERE platform IN ('gumroad','shopify','patreon','etsy','substack');

-- creator_platform_connections: allow shopify + shop_domain
ALTER TABLE public.creator_platform_connections
  ADD COLUMN IF NOT EXISTS shop_domain text;

DO $$
DECLARE _has_check boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_platform_connections_platform_check'
      AND conrelid = 'public.creator_platform_connections'::regclass
  ) INTO _has_check;
  IF _has_check THEN
    EXECUTE 'ALTER TABLE public.creator_platform_connections DROP CONSTRAINT creator_platform_connections_platform_check';
  END IF;
END $$;

ALTER TABLE public.creator_platform_connections
  ADD CONSTRAINT creator_platform_connections_platform_check
  CHECK (platform IN ('gumroad','shopify','patreon','etsy','substack'));

-- Lock down oauth_states (was open with RLS disabled in surface scan)
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated; service role bypasses.
REVOKE ALL ON public.oauth_states FROM PUBLIC, anon, authenticated;