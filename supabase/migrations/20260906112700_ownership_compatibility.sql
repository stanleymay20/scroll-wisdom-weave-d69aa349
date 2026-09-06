-- Additive ownership compatibility required by the current generation and QA
-- pipeline. This intentionally preserves creator_id and existing RLS policies.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.books
SET user_id = creator_id
WHERE user_id IS NULL
  AND creator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);

-- Keep rows created by legacy code compatible after the one-time backfill.
CREATE OR REPLACE FUNCTION public.sync_profile_user_id_compat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_profile_user_id_compat_trigger'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER sync_profile_user_id_compat_trigger
    BEFORE INSERT OR UPDATE OF id, user_id
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_user_id_compat();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_book_user_id_compat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.creator_id IS NOT NULL THEN
    NEW.user_id := NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_book_user_id_compat_trigger'
      AND tgrelid = 'public.books'::regclass
  ) THEN
    CREATE TRIGGER sync_book_user_id_compat_trigger
    BEFORE INSERT OR UPDATE OF creator_id, user_id
    ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_book_user_id_compat();
  END IF;
END $$;
