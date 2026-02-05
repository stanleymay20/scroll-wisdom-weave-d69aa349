
-- Update profiles RLS to handle BOTH id and user_id patterns
-- Production uses id = auth.uid(), Test uses user_id = auth.uid()
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
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
USING (auth.uid() = user_id OR auth.uid() = id);

-- Update books RLS to handle both user_id and creator_id
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
USING (auth.uid() = creator_id OR auth.uid() = user_id);

CREATE POLICY "Users can delete own books"
ON public.books FOR DELETE
USING (auth.uid() = creator_id OR auth.uid() = user_id);
