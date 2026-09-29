-- GA hardening: anonymous callers never need an admin RPC.
--
-- Every SECURITY DEFINER admin RPC below already checks auth.uid() and the
-- canonical admin role internally. Removing PUBLIC/anon EXECUTE adds a database
-- privilege boundary in front of that application-level guard, reducing attack
-- surface and avoiding needless execution by unauthenticated callers.

DO $hardening$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proname LIKE 'admin\_%' ESCAPE '\'
        OR p.proname LIKE 'get_admin\_%' ESCAPE '\'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      fn.schema_name, fn.function_name, fn.identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      fn.schema_name, fn.function_name, fn.identity_args
    );
  END LOOP;
END
$hardening$;

DO $assertions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proname LIKE 'admin\_%' ESCAPE '\'
        OR p.proname LIKE 'get_admin\_%' ESCAPE '\'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'GA hardening failed: anon can still execute an admin SECURITY DEFINER RPC';
  END IF;
END
$assertions$;
