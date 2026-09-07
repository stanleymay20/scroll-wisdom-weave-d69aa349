-- Historical reconciliation migration.
--
-- Earlier migrations already create the core ScrollLibrary tables and app_role.
-- The original version of this migration attempted to recreate those objects,
-- which made a clean migration replay fail. Keep this migration non-destructive:
-- add the compatibility columns/tables this point in history introduced, retain
-- richer schemas that already exist, and make policies/triggers idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END
$$;

-- Profiles existed from the first migration with id = auth.users.id. Preserve
-- that authority model while adding the later compatibility fields.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bio TEXT;

UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx ON public.profiles(user_id);

-- user_roles already exists from 20251210151834. Do not replace it.

-- Add ownership and authoring compatibility fields to the original books table.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS book_type TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS academic_level TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT;

-- Add authoring-state fields to the original chapters table.
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS last_ai_content TEXT,
  ADD COLUMN IF NOT EXISTS user_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_ownership JSONB DEFAULT '{"isUserAuthored": false, "isAIGenerated": true, "isHybrid": false}'::jsonb;

-- The original library table lacked updated_at.
ALTER TABLE public.user_library
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;

-- Preserve the richer Contract 6D quiz_attempts schema and only add the later
-- free-form answers payload when it is absent.
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS answers JSONB;

-- Preserve the moderation-oriented content_reports schema while adding direct
-- book/chapter references used by later UI code.
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE;

-- These tables were genuinely introduced by this migration lineage.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tier TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.saved_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deck_type TEXT DEFAULT 'flashcard',
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- RLS remains enabled on every browser-facing table.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_decks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Recreate only this migration's policy names so replay is deterministic.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Published books are viewable by everyone" ON public.books;
DROP POLICY IF EXISTS "Users can create own books" ON public.books;
DROP POLICY IF EXISTS "Users can update own books" ON public.books;
DROP POLICY IF EXISTS "Users can delete own books" ON public.books;
CREATE POLICY "Published books are viewable by everyone" ON public.books FOR SELECT USING (is_published = true OR auth.uid() = user_id);
CREATE POLICY "Users can create own books" ON public.books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own books" ON public.books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own books" ON public.books FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Chapters viewable if book is accessible" ON public.chapters;
DROP POLICY IF EXISTS "Users can manage chapters of own books" ON public.chapters;
CREATE POLICY "Chapters viewable if book is accessible" ON public.chapters FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND (is_published = true OR user_id = auth.uid()))
);
CREATE POLICY "Users can manage chapters of own books" ON public.chapters FOR ALL USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view own library" ON public.user_library;
DROP POLICY IF EXISTS "Users can add to own library" ON public.user_library;
DROP POLICY IF EXISTS "Users can update own library" ON public.user_library;
DROP POLICY IF EXISTS "Users can remove from own library" ON public.user_library;
CREATE POLICY "Users can view own library" ON public.user_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to own library" ON public.user_library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own library" ON public.user_library FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove from own library" ON public.user_library FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own quiz attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Users can create own quiz attempts" ON public.quiz_attempts;
CREATE POLICY "Users can view own quiz attempts" ON public.quiz_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own quiz attempts" ON public.quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create reports" ON public.content_reports;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.content_reports;
CREATE POLICY "Users can create reports" ON public.content_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Admins can view all reports" ON public.content_reports FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can manage subscriptions" ON public.subscriptions FOR ALL USING (true);

DROP POLICY IF EXISTS "Users can view own decks" ON public.saved_decks;
DROP POLICY IF EXISTS "Users can create own decks" ON public.saved_decks;
DROP POLICY IF EXISTS "Users can update own decks" ON public.saved_decks;
DROP POLICY IF EXISTS "Users can delete own decks" ON public.saved_decks;
CREATE POLICY "Users can view own decks" ON public.saved_decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own decks" ON public.saved_decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own decks" ON public.saved_decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own decks" ON public.saved_decks FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_books_updated_at ON public.books;
DROP TRIGGER IF EXISTS update_chapters_updated_at ON public.chapters;
DROP TRIGGER IF EXISTS update_user_library_updated_at ON public.user_library;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS update_saved_decks_updated_at ON public.saved_decks;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_library_updated_at BEFORE UPDATE ON public.user_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_saved_decks_updated_at BEFORE UPDATE ON public.saved_decks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Signup must satisfy both the original id authority column and the later user_id
-- compatibility column. Role creation is idempotent for replay/test fixtures.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, full_name, avatar_url)
  VALUES (NEW.id, NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();