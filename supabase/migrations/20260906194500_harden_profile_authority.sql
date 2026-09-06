-- Harden profile authority.
--
-- Closes the confirmed profile privilege-escalation path: browsers previously
-- held table-wide UPDATE/INSERT on public.profiles (anon and authenticated),
-- the owner UPDATE policy had no WITH CHECK, and several RLS policies trusted
-- the browser-writable public.profiles.role column for admin decisions.
--
-- Authority model after this migration:
--   * public.profiles.role is LEGACY and NON-AUTHORITATIVE. It is retained only
--     for backward compatibility on schemas that still carry it. It must never
--     be consulted for authorization.
--   * public.user_roles + public.has_role(uid, role) is the CANONICAL authority
--     source for admin/moderator decisions (RLS policies and triggers).
--   * Authority fields on profiles (role, plan, daily_book_count,
--     last_book_date, tts_minutes_used, tts_month, id, user_id, created_at)
--     are server-owned. Only service-role/server execution (auth.uid() IS NULL)
--     or a has_role() admin may set them.
--   * Authenticated users keep normal preference/consent writes on their own
--     row through column-scoped UPDATE privileges.
--
-- The tracked schema history has two lineages (legacy `id = auth uid` and the
-- current `user_id = auth uid` with a surrogate `id`). Everything below is
-- written to be correct on both: columns that may be absent are handled
-- dynamically, tables that may be absent are guarded, and owner identity is
-- matched on either `id` or `user_id`. Neither identity column is
-- browser-writable (no column privilege and pinned by the trigger), so the
-- `user_id` alternative is as strong as `id` alone.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_ip text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    EXECUTE $c$COMMENT ON COLUMN public.profiles.role IS
      'LEGACY / NON-AUTHORITATIVE. Never use for authorization. Canonical roles live in public.user_roles and are checked via public.has_role(). Pinned server-only by trigger profiles_enforce_authority_fields.'$c$;
  END IF;
END
$$;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    ((select auth.uid()) = id)
    OR ((select auth.uid()) = user_id)
  )
  WITH CHECK (
    ((select auth.uid()) = id)
    OR ((select auth.uid()) = user_id)
  );

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  avatar_url,
  bio,
  country,
  learning_preferences,
  ai_voice_preference,
  theme_preference,
  font_size,
  reader_theme,
  tts_enabled,
  animations_enabled,
  email_updates,
  new_book_alerts,
  course_reminders,
  writing_tone,
  spiritual_strictness,
  complexity_level,
  study_speed,
  accepted_terms,
  accepted_terms_at,
  newsletter_subscribed,
  newsletter_subscribed_at,
  consent_ip,
  updated_at
) ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_profile_authority_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_old jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_col text;
  v_authority_cols CONSTANT text[] := ARRAY[
    'role',
    'plan',
    'daily_book_count',
    'last_book_date',
    'tts_minutes_used',
    'tts_month',
    'id',
    'user_id',
    'created_at'
  ];
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_actor, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  v_row := to_jsonb(NEW);

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    FOREACH v_col IN ARRAY v_authority_cols LOOP
      IF v_old ? v_col THEN
        v_patch := v_patch || jsonb_build_object(v_col, v_old -> v_col);
      END IF;
    END LOOP;
  ELSE
    IF v_row ? 'role' THEN
      v_patch := v_patch || jsonb_build_object('role', 'user');
    END IF;
    IF v_row ? 'plan' THEN
      v_patch := v_patch || jsonb_build_object('plan', 'free');
    END IF;
    IF v_row ? 'daily_book_count' THEN
      v_patch := v_patch || jsonb_build_object('daily_book_count', 0);
    END IF;
    IF v_row ? 'last_book_date' THEN
      v_patch := v_patch || jsonb_build_object('last_book_date', NULL);
    END IF;
    IF v_row ? 'tts_minutes_used' THEN
      v_patch := v_patch || jsonb_build_object('tts_minutes_used', 0);
    END IF;
    IF v_row ? 'tts_month' THEN
      v_patch := v_patch || jsonb_build_object('tts_month', NULL);
    END IF;
    IF v_row ? 'created_at' THEN
      v_patch := v_patch || jsonb_build_object(
        'created_at',
        CASE
          WHEN jsonb_typeof(v_row -> 'created_at') IS DISTINCT FROM 'null'
            THEN v_row -> 'created_at'
          ELSE to_jsonb(now())
        END
      );
    END IF;
    v_patch := v_patch || jsonb_build_object('id', v_actor);
    IF v_row ? 'user_id' THEN
      v_patch := v_patch || jsonb_build_object('user_id', v_actor);
    END IF;
  END IF;

  IF v_patch <> '{}'::jsonb THEN
    NEW := jsonb_populate_record(NEW, v_patch);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_profile_authority_fields() IS
  'Pins server-owned profile authority fields (role, plan, quota counters, identity, created_at) for authenticated non-admin actors. Admin is determined only via public.has_role(); profiles.role is legacy and non-authoritative.';

REVOKE ALL ON FUNCTION public.enforce_profile_authority_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_role_protection ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_self_assignment();

DROP TRIGGER IF EXISTS profiles_enforce_authority_fields ON public.profiles;
CREATE TRIGGER profiles_enforce_authority_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_authority_fields();

DO $$
BEGIN
  IF to_regclass('public.assessment_integrity_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all integrity logs" ON public.assessment_integrity_logs';
    EXECUTE $p$
      CREATE POLICY "Admins can view all integrity logs"
        ON public.assessment_integrity_logs
        FOR SELECT
        TO authenticated
        USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.highlights') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all highlights" ON public.highlights';
    EXECUTE $p$
      CREATE POLICY "Admins can view all highlights"
        ON public.highlights
        FOR SELECT
        TO authenticated
        USING (
          public.has_role((select auth.uid()), 'admin'::public.app_role)
          OR public.has_role((select auth.uid()), 'moderator'::public.app_role)
        )
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.publishing_certificates') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Certificates viewable by owner or admin" ON public.publishing_certificates';
    EXECUTE $p$
      CREATE POLICY "Certificates viewable by owner or admin"
        ON public.publishing_certificates
        FOR SELECT
        TO authenticated
        USING (
          ((select auth.uid()) = user_id)
          OR public.has_role((select auth.uid()), 'admin'::public.app_role)
        )
    $p$;

    EXECUTE 'DROP POLICY IF EXISTS "Only system can issue certificates" ON public.publishing_certificates';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can issue certificates" ON public.publishing_certificates';
    EXECUTE $p$
      CREATE POLICY "Service role can issue certificates"
        ON public.publishing_certificates
        FOR INSERT
        TO service_role
        WITH CHECK (true)
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.security_audit_log') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.security_audit_log';
    EXECUTE $p$
      CREATE POLICY "Only admins can view audit logs"
        ON public.security_audit_log
        FOR SELECT
        TO authenticated
        USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.study_notes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all study notes" ON public.study_notes';
    EXECUTE $p$
      CREATE POLICY "Admins can view all study notes"
        ON public.study_notes
        FOR SELECT
        TO authenticated
        USING (
          public.has_role((select auth.uid()), 'admin'::public.app_role)
          OR public.has_role((select auth.uid()), 'moderator'::public.app_role)
        )
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.user_library') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all library entries" ON public.user_library';
    EXECUTE $p$
      CREATE POLICY "Admins can view all library entries"
        ON public.user_library
        FOR SELECT
        TO authenticated
        USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
    $p$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.publishing_certificates') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT ON TABLE public.publishing_certificates FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.publishing_certificates TO service_role';
  END IF;
END
$$;