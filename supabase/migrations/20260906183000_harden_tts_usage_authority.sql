-- Make TTS quota accounting server-authoritative.
--
-- The text-to-speech Edge Function already records usage with the service role.
-- Browser INSERT/UPDATE/DELETE access lets a user tamper with their own quota row
-- and is therefore intentionally removed. Authenticated users retain read-only
-- access to their own usage so the UI can display remaining allowance.

ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.tts_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tts_usage FROM authenticated;
GRANT SELECT ON TABLE public.tts_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tts_usage TO service_role;

DROP POLICY IF EXISTS "Users can insert own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can update own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can delete own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can view own TTS usage" ON public.tts_usage;

CREATE POLICY "Users can view own TTS usage"
  ON public.tts_usage
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.tts_usage IS
  'Server-authoritative TTS quota accounting. Authenticated clients may read only their own usage; service-role Edge Functions own mutations.';
