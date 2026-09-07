-- Historical account-transfer migration.
--
-- This migration was created for a specific production account handoff. A clean
-- database does not contain that auth user, and foreign keys must remain
-- authoritative. Perform the transfer only when the intended destination auth
-- identity actually exists; never fabricate an auth user or weaken constraints.
DO $$
DECLARE
  old_user CONSTANT uuid := '39003e95-8f10-4dd4-a513-862fdd928dd1'::uuid;
  new_user CONSTANT uuid := '607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf'::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = new_user) THEN
    -- Transfer all books from the historical admin to the replacement account.
    UPDATE public.books
    SET creator_id = new_user
    WHERE creator_id = old_user;

    -- Transfer the historical admin's library entries.
    UPDATE public.user_library
    SET user_id = new_user
    WHERE user_id = old_user;

    -- Grant the replacement account the intended admin role.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Preserve the historical account plan/profile update when that profile is
    -- present. If the signup/profile trigger has not populated it, this is a no-op.
    UPDATE public.profiles
    SET plan = 'prophet_tier', full_name = 'Stanley May'
    WHERE id = new_user;
  END IF;
END
$$;