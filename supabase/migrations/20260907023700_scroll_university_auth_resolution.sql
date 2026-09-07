-- Resolve only roster-requested auth identities instead of enumerating the
-- entire auth user base. Service-role only; no auth.users data is exposed to
-- browser clients.
CREATE OR REPLACE FUNCTION public.resolve_university_auth_users(_emails text[])
RETURNS TABLE (
  email text,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH requested AS (
    SELECT DISTINCT lower(btrim(value)) AS email
    FROM unnest(_emails) AS value
    WHERE value IS NOT NULL AND btrim(value) <> ''
    LIMIT 500
  )
  SELECT lower(u.email) AS email, u.id AS user_id
  FROM auth.users u
  JOIN requested r ON r.email = lower(u.email)
  WHERE u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.resolve_university_auth_users(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_university_auth_users(text[])
  TO service_role;
