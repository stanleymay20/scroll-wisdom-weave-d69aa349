-- ScrollUniversity LTI 1.3 interoperability model.
-- Connections contain public platform metadata only. OIDC state and validated
-- launch records are service-only and short-lived. No platform secrets are
-- exposed through the Data API.

CREATE TABLE IF NOT EXISTS public.university_lms_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  standard text NOT NULL DEFAULT 'lti_1_3' CHECK (standard IN ('lti_1_3')),
  issuer text NOT NULL,
  client_id text NOT NULL,
  auth_login_url text NOT NULL,
  jwks_url text NOT NULL,
  deployment_id text,
  tool_url text NOT NULL,
  status text NOT NULL DEFAULT 'configured'
    CHECK (status IN ('draft','configured','verified','disabled','error')),
  last_verified_at timestamptz,
  last_error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, issuer, client_id)
);

CREATE TABLE IF NOT EXISTS public.university_lti_oidc_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.university_lms_connections(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  nonce text NOT NULL,
  login_hint text NOT NULL,
  lti_message_hint text,
  target_link_uri text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_lti_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.university_lms_connections(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  launch_token_hash text NOT NULL UNIQUE,
  subject text NOT NULL,
  deployment_id text,
  message_type text NOT NULL,
  lti_version text NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  resource_link_claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_claim jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_by uuid,
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.university_lms_connections(id) ON DELETE CASCADE,
  external_subject text NOT NULL,
  user_id uuid NOT NULL,
  roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_launch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_subject),
  UNIQUE (connection_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_university_lms_connections_lookup
  ON public.university_lms_connections(issuer, client_id, status);
CREATE INDEX IF NOT EXISTS idx_university_lti_states_expiry
  ON public.university_lti_oidc_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_university_lti_launches_expiry
  ON public.university_lti_launches(expires_at, claimed_at);
CREATE INDEX IF NOT EXISTS idx_university_external_identity_user
  ON public.university_external_identities(organization_id, user_id);

ALTER TABLE public.university_lms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_lti_oidc_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_lti_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_external_identities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.university_lms_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_lti_oidc_states FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_lti_launches FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_external_identities FROM anon, authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.university_lms_connections TO authenticated;
GRANT UPDATE (name, auth_login_url, jwks_url, deployment_id, tool_url, updated_at)
  ON public.university_lms_connections TO authenticated;
GRANT SELECT ON TABLE public.university_external_identities TO authenticated;

GRANT ALL ON TABLE public.university_lms_connections TO service_role;
GRANT ALL ON TABLE public.university_lti_oidc_states TO service_role;
GRANT ALL ON TABLE public.university_lti_launches TO service_role;
GRANT ALL ON TABLE public.university_external_identities TO service_role;

CREATE POLICY "Academic admins can view LMS connections"
ON public.university_lms_connections FOR SELECT TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can configure LTI connections"
ON public.university_lms_connections FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_admin((SELECT auth.uid()), organization_id)
  AND created_by = (SELECT auth.uid())
  AND status IN ('draft','configured')
  AND last_verified_at IS NULL
  AND last_error IS NULL
);

CREATE POLICY "Organization admins can update LTI connection metadata"
ON public.university_lms_connections FOR UPDATE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can remove LTI connections"
ON public.university_lms_connections FOR DELETE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Users can view their own external identity links"
ON public.university_external_identities FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.is_university_academic_admin((SELECT auth.uid()), organization_id)
);

DROP TRIGGER IF EXISTS update_university_lms_connections_updated_at
ON public.university_lms_connections;
CREATE TRIGGER update_university_lms_connections_updated_at
BEFORE UPDATE ON public.university_lms_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_university_external_identities_updated_at
ON public.university_external_identities;
CREATE TRIGGER update_university_external_identities_updated_at
BEFORE UPDATE ON public.university_external_identities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
