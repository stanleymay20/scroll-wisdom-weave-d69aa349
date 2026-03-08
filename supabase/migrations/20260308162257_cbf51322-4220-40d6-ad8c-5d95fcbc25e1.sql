
-- Drop the broken trigger that references non-existent 'role' column on profiles
DROP TRIGGER IF EXISTS enforce_role_protection ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_role_self_assignment();
