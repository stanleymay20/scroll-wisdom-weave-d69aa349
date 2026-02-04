-- Fix books RLS: SELECT policies need to be PERMISSIVE for OR logic
-- Drop the restrictive policies and recreate as permissive

DROP POLICY IF EXISTS "Anyone can view published books" ON public.books;
DROP POLICY IF EXISTS "Creators can view their own books" ON public.books;
DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;

-- Create PERMISSIVE policies (default) - either condition grants access
CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (is_published = true);

CREATE POLICY "Creators can view their own books"
  ON public.books FOR SELECT
  USING (auth.uid() = creator_id);