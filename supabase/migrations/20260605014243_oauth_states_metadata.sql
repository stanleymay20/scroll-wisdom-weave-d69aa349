-- ============================================================================
-- Add metadata jsonb column to oauth_states so platform-specific scratch
-- (e.g. Shopify shop_domain) lives in a typed column instead of being packed
-- with a "|" separator into the return_url text field.
-- ============================================================================

ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.oauth_states.metadata IS
  'Platform-specific scratch (Shopify shop_domain, etc.). Single-use rows; deleted at callback time.';
