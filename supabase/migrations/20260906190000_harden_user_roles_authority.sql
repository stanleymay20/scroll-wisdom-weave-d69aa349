-- Harden canonical role authority.
--
-- public.user_roles is the authorization source for admin/moderator decisions.
-- Browser roles must not retain broad table privileges such as TRUNCATE,
-- REFERENCES or TRIGGER. Authenticated users may read their own role rows;
-- canonical admins may manage role rows through RLS with explicit WITH CHECK.

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_roles FROM anon;
REVOKE ALL ON TABLE public.user_roles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

COMMENT ON TABLE public.user_roles IS
  'Canonical application role authority. profiles.role is legacy/non-authoritative. Browser access is RLS-scoped; broad/structural table privileges are intentionally revoked.';
