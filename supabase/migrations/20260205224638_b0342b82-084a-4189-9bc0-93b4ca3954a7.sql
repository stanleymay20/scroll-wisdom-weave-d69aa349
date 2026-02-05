-- Add user_id to profiles if it doesn't exist (production doesn't have it)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'user_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN user_id uuid;
  END IF;
END $$;

-- Populate user_id from id (in production, id IS the auth uid)
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- Add user_id to books if it doesn't exist (production uses creator_id only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'books' AND column_name = 'user_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.books ADD COLUMN user_id uuid NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Populate user_id from creator_id
UPDATE public.books SET user_id = creator_id WHERE creator_id IS NOT NULL AND user_id != creator_id;

-- Also add missing columns to profiles that test has but production doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'target_audience' AND table_schema = 'public'
  ) THEN
    -- target_audience is on books not profiles, skip
    NULL;
  END IF;
END $$;

-- Ensure RLS policies work with both id and user_id patterns
-- Drop and recreate profiles policies to handle both columns
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

-- Books policies - handle both user_id and creator_id
DROP POLICY IF EXISTS "Creators can view their own books" ON public.books;
CREATE POLICY "Creators can view their own books" ON public.books
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own books" ON public.books;
CREATE POLICY "Users can create own books" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own books" ON public.books;
CREATE POLICY "Users can update own books" ON public.books
  FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own books" ON public.books;
CREATE POLICY "Users can delete own books" ON public.books
  FOR DELETE USING (auth.uid() = creator_id OR auth.uid() = user_id);

-- Keep the published books policy
DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
CREATE POLICY "Published books are viewable by everyone" ON public.books
  FOR SELECT USING (is_published = true);