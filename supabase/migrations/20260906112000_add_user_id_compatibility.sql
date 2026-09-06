-- Additive ownership compatibility for older schemas.
-- Keeps legacy creator_id/id ownership intact while adding the user_id columns
-- expected by current generation, QA, and publication code.

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
