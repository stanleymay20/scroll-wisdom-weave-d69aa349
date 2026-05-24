
-- ============== creator_platform_connections ==============
CREATE TABLE IF NOT EXISTS public.creator_platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('gumroad','shopify','patreon','etsy','substack')),
  -- Encrypted token blob: { ciphertext, iv, tag } base64. Decrypted only in edge fns.
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  external_creator_id text,
  external_creator_name text,
  scopes text[] NOT NULL DEFAULT '{}',
  connection_status text NOT NULL DEFAULT 'connected'
    CHECK (connection_status IN ('connected','expired','revoked','error')),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_cpc_status ON public.creator_platform_connections(connection_status);

ALTER TABLE public.creator_platform_connections ENABLE ROW LEVEL SECURITY;

-- Owner can SEE the row exists & manage status flags, but the encrypted token
-- columns are never exposed via the client (queries select narrow columns).
-- Inserts/updates of token material happen exclusively via the service role.
CREATE POLICY "Users view own connections"
  ON public.creator_platform_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own connections"
  ON public.creator_platform_connections FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all connections"
  ON public.creator_platform_connections FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- NOTE: No INSERT/UPDATE policy for clients -> all writes must use service role.

CREATE TRIGGER cpc_updated_at
  BEFORE UPDATE ON public.creator_platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== oauth_states (short-lived CSRF tokens) ==============
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  return_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No client policies; service-role only.

-- ============== external_publications extensions ==============
ALTER TABLE public.external_publications
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS sync_state text NOT NULL DEFAULT 'manual'
    CHECK (sync_state IN ('manual','auto','syncing','error')),
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Extend status to include 'pending' and 'failed' for direct-publish flows.
ALTER TABLE public.external_publications
  DROP CONSTRAINT IF EXISTS external_publications_status_check;
ALTER TABLE public.external_publications
  ADD CONSTRAINT external_publications_status_check
  CHECK (status IN ('live','draft','removed','pending','failed'));

-- Idempotency: at most one row per (book, platform) for automated publishes.
-- Manual records can still be added via a different platform string ('other').
CREATE UNIQUE INDEX IF NOT EXISTS uniq_external_pub_book_platform
  ON public.external_publications(book_id, platform)
  WHERE platform IN ('gumroad','shopify','patreon','etsy','substack');

DROP TRIGGER IF EXISTS external_pub_updated_at ON public.external_publications;
CREATE TRIGGER external_pub_updated_at
  BEFORE UPDATE ON public.external_publications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow users to delete their own auto-publish rows (so they can retry from scratch
-- after a failure — service role will repopulate on next publish).
DROP POLICY IF EXISTS "Users delete own external publications" ON public.external_publications;
CREATE POLICY "Users delete own external publications"
  ON public.external_publications FOR DELETE
  USING (auth.uid() = user_id);

-- ============== Connection summary helper (safe columns only) ==============
CREATE OR REPLACE FUNCTION public.get_my_platform_connections()
RETURNS TABLE (
  platform text,
  connection_status text,
  external_creator_name text,
  scopes text[],
  connected_at timestamptz,
  last_used_at timestamptz,
  last_error text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT platform, connection_status, external_creator_name, scopes,
         created_at AS connected_at, last_used_at, last_error
  FROM public.creator_platform_connections
  WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_platform_connections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_platform_connections() TO authenticated;
