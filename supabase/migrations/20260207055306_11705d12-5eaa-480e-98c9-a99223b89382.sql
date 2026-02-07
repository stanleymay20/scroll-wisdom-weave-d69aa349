
-- ============================================
-- PRODUCTION SCHEMA FIX: Add missing columns
-- ============================================

-- 1. Add user_id to profiles (production uses 'id' as auth uid)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill: in production, id IS the auth uid
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- 2. Add user_id to books (production uses creator_id)
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill from creator_id
UPDATE public.books SET user_id = creator_id WHERE creator_id IS NOT NULL AND user_id IS NULL;

-- 3. Add missing columns the app code expects
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS academic_level text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS target_audience text;

-- 4. Add missing columns to reading_sessions
ALTER TABLE public.reading_sessions ADD COLUMN IF NOT EXISTS chapter_number integer;

-- 5. Add missing columns to reading_goals  
ALTER TABLE public.reading_goals ADD COLUMN IF NOT EXISTS daily_pages_goal integer;

-- 6. Add missing columns to saved_learning_decks
ALTER TABLE public.saved_learning_decks ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE public.saved_learning_decks ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

-- ============================================
-- RLS POLICIES: Dual-column compatibility
-- ============================================

-- Profiles policies: support both user_id and id
DROP POLICY IF EXISTS "Users can view their own profile only" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

-- Keep admin view policy
-- (already exists: "Admins can view all profiles")

-- Books policies: support both user_id and creator_id
DROP POLICY IF EXISTS "Creators can view their own books" ON public.books;
CREATE POLICY "Creators can view their own books" ON public.books
  FOR SELECT USING (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can create books" ON public.books;
DROP POLICY IF EXISTS "Users can create own books" ON public.books;
CREATE POLICY "Users can create own books" ON public.books
  FOR INSERT WITH CHECK (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Creators can update their own books" ON public.books;
DROP POLICY IF EXISTS "Users can update own books" ON public.books;
CREATE POLICY "Users can update own books" ON public.books
  FOR UPDATE USING (auth.uid() = creator_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Creators can delete their own books" ON public.books;
DROP POLICY IF EXISTS "Users can delete own books" ON public.books;
CREATE POLICY "Users can delete own books" ON public.books
  FOR DELETE USING (auth.uid() = creator_id OR auth.uid() = user_id);

-- Keep published books visible to all
DROP POLICY IF EXISTS "Anyone can view published books" ON public.books;
DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
CREATE POLICY "Published books are viewable by everyone" ON public.books
  FOR SELECT USING (is_published = true);
