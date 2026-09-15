-- Align competency certificate authority with the hardened publishing
-- certificate contract. Trusted certificate mutation is server-owned; browser
-- roles must not be able to mint, rewrite, revoke, or delete certification
-- records directly even when an older RLS policy exists.

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.competency_certificates
  FROM PUBLIC, anon, authenticated;

GRANT ALL
  ON TABLE public.competency_certificates
  TO service_role;

-- Keep public/read-only verification reachable through the existing policies
-- and verification endpoints without granting browser mutation authority.
GRANT SELECT
  ON TABLE public.competency_certificates
  TO anon, authenticated;
