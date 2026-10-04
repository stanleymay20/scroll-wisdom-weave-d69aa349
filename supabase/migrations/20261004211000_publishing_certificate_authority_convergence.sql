-- Commercial GA convergence: publishing certificates are issued and revoked by
-- trusted server workflows. Browser roles may read certificates, but must never
-- be able to INSERT, UPDATE, DELETE, un-revoke, self-upgrade, or rewrite the
-- evidence recorded on a certificate.
--
-- This is a forward-only convergence migration. Do not rewrite historical
-- certificate migrations or trust their ledger state in Lovable-controlled
-- production.

DO $$
BEGIN
  IF to_regclass('public.publishing_certificates') IS NULL THEN
    RAISE EXCEPTION 'publishing_certificates missing';
  END IF;

  -- Remove the historical owner FOR ALL policy that made certificate evidence
  -- browser-mutable. Public/owner SELECT policies remain intact.
  DROP POLICY IF EXISTS "Users can manage own certificates"
    ON public.publishing_certificates;

  -- Table grants are an independent authority boundary from RLS. Revoke every
  -- browser mutation path even if a permissive policy is recreated later.
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.publishing_certificates
    FROM PUBLIC, anon, authenticated;

  -- Certificate reads remain available according to existing SELECT policies.
  GRANT SELECT ON TABLE public.publishing_certificates TO anon, authenticated;

  -- Trusted server workflows retain full authority to issue/revoke certificates.
  GRANT ALL ON TABLE public.publishing_certificates TO service_role;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('anon','public.publishing_certificates','INSERT')
     OR has_table_privilege('anon','public.publishing_certificates','UPDATE')
     OR has_table_privilege('anon','public.publishing_certificates','DELETE')
     OR has_table_privilege('authenticated','public.publishing_certificates','INSERT')
     OR has_table_privilege('authenticated','public.publishing_certificates','UPDATE')
     OR has_table_privilege('authenticated','public.publishing_certificates','DELETE') THEN
    RAISE EXCEPTION 'browser role retains publishing certificate mutation privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='publishing_certificates'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND roles && ARRAY['public'::name,'anon'::name,'authenticated'::name]
  ) THEN
    RAISE EXCEPTION 'browser/public publishing certificate write policy remains';
  END IF;

  IF NOT has_table_privilege('service_role','public.publishing_certificates','INSERT')
     OR NOT has_table_privilege('service_role','public.publishing_certificates','UPDATE')
     OR NOT has_table_privilege('service_role','public.publishing_certificates','DELETE') THEN
    RAISE EXCEPTION 'service_role lost publishing certificate mutation authority';
  END IF;
END
$$;
