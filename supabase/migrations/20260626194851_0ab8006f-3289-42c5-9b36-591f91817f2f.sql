-- S1+S2: Grant service_role + authenticated insert on existing AI ledger/usage tables.
-- Root cause: ai_attribution_ledger was empty because edge functions had no INSERT grant.
GRANT SELECT, INSERT ON public.ai_attribution_ledger TO service_role;
GRANT ALL ON public.ai_attribution_ledger TO service_role;
GRANT SELECT ON public.ai_attribution_ledger TO authenticated;

GRANT SELECT, INSERT ON public.ai_usage_tracking TO service_role;
GRANT ALL ON public.ai_usage_tracking TO service_role;
GRANT SELECT, INSERT ON public.ai_usage_tracking TO authenticated;

-- Allow service_role inserts to bypass the owner-only SELECT policy (RLS is permissive for service_role by default,
-- but add an explicit INSERT policy so authenticated users can also self-log if invoked client-side).
DROP POLICY IF EXISTS ai_ledger_insert_service ON public.ai_attribution_ledger;
CREATE POLICY ai_ledger_insert_service ON public.ai_attribution_ledger
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_usage_insert_self ON public.ai_usage_tracking;
CREATE POLICY ai_usage_insert_self ON public.ai_usage_tracking
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);