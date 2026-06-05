-- Tighten storefront_events insert policy
DROP POLICY IF EXISTS "Anyone can insert storefront events" ON public.storefront_events;
CREATE POLICY "Anyone can insert storefront events"
  ON public.storefront_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Tighten search_queries insert policy
DROP POLICY IF EXISTS "Anyone can insert search queries" ON public.search_queries;
CREATE POLICY "Anyone can insert search queries"
  ON public.search_queries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Explicit deny on oauth_states for anon/authenticated (service_role bypasses RLS)
CREATE POLICY "Deny all client access to oauth_states"
  ON public.oauth_states
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.oauth_states FROM anon, authenticated;