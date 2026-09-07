-- Update profiles RLS to handle BOTH id and user_id patterns.
-- Production historically used id = auth.uid(); later compatibility work also
-- populated user_id = auth.uid(). Drop both old and target policy names so this
-- migration remains deterministic when replayed from a clean database.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id OR auth.uid() = id)
WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

-- Update books RLS to handle both user_id and creator_id. Remove every policy
-- name this migration owns before recreating it; this preserves RLS while
-- avoiding duplicate-policy failures during disaster-recovery replay.
DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
DROP POLICY IF EXISTS "Creators can view their own books" ON public.books;
DROP POLICY IF EXISTS "Users can create own books" ON public.books;
DROP POLICY IF EXISTS "Users can update own books" ON public.books;
DROP POLICY IF EXISTS "Users can delete own books" ON public.books;

CREATE POLICY "Published books are viewable by everyone"
ON public.books FOR SELECT
USING (is_published = true);

CREATE POLICY "Creators can view their own books"
ON public.books FOR SELECT
USING (auth.uid() = creator_id OR auth.uid() = user_id);

CREATE POLICY "Users can create own books"
ON public.books FOR INSERT
WITH CHECK (auth.uid() = creator_id OR auth.uid() = user_id);

CREATE POLICY "Users can update own books"
ON public.books FOR UPDATE
USING (auth.uid() = creator_id OR auth.uid() = user_id)
WITH CHECK (auth.uid() = creator_id OR auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
ON public.books FOR DELETE
USING (auth.uid() = creator_id OR auth.uid() = user_id);