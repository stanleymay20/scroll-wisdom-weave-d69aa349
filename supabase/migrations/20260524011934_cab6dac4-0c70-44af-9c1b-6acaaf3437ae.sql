
-- ===== Collections =====
CREATE TABLE IF NOT EXISTS public.book_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  cover_image_url text,
  is_public boolean NOT NULL DEFAULT false,
  sort_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_book_collections_owner ON public.book_collections(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_book_collections_public ON public.book_collections(is_public) WHERE is_public = true;

ALTER TABLE public.book_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public collections visible to all"
  ON public.book_collections FOR SELECT
  USING (is_public = true);

CREATE POLICY "Owners can view own collections"
  ON public.book_collections FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can insert their collections"
  ON public.book_collections FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update their collections"
  ON public.book_collections FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can delete their collections"
  ON public.book_collections FOR DELETE
  USING (auth.uid() = owner_user_id);

CREATE TRIGGER trg_book_collections_updated
  BEFORE UPDATE ON public.book_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Collection items =====
CREATE TABLE IF NOT EXISTS public.book_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.book_collections(id) ON DELETE CASCADE,
  book_id uuid NOT NULL,
  sort_index int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON public.book_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_book ON public.book_collection_items(book_id);

ALTER TABLE public.book_collection_items ENABLE ROW LEVEL SECURITY;

-- Helper: collection visibility check (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.collection_visible_to(_collection_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_collections c
    WHERE c.id = _collection_id
      AND (c.is_public = true OR c.owner_user_id = _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.collection_owned_by(_collection_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_collections c
    WHERE c.id = _collection_id AND c.owner_user_id = _user_id
  )
$$;

CREATE POLICY "Items visible when collection visible"
  ON public.book_collection_items FOR SELECT
  USING (public.collection_visible_to(collection_id, auth.uid()));

CREATE POLICY "Owners manage items insert"
  ON public.book_collection_items FOR INSERT
  WITH CHECK (public.collection_owned_by(collection_id, auth.uid()));

CREATE POLICY "Owners manage items update"
  ON public.book_collection_items FOR UPDATE
  USING (public.collection_owned_by(collection_id, auth.uid()));

CREATE POLICY "Owners manage items delete"
  ON public.book_collection_items FOR DELETE
  USING (public.collection_owned_by(collection_id, auth.uid()));

-- ===== Reading progress =====
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  chapter_id uuid,
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  source text NOT NULL DEFAULT 'sample' CHECK (source IN ('sample','full','owned')),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user_recent ON public.reading_progress(user_id, last_read_at DESC);

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own progress"
  ON public.reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own progress"
  ON public.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own progress"
  ON public.reading_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own progress"
  ON public.reading_progress FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_reading_progress_updated
  BEFORE UPDATE ON public.reading_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Author followers =====
CREATE TABLE IF NOT EXISTS public.author_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_user_id, author_user_id),
  CHECK (follower_user_id <> author_user_id)
);
CREATE INDEX IF NOT EXISTS idx_author_followers_author ON public.author_followers(author_user_id);
CREATE INDEX IF NOT EXISTS idx_author_followers_follower ON public.author_followers(follower_user_id);

ALTER TABLE public.author_followers ENABLE ROW LEVEL SECURITY;

-- Public can read followers (used for counts and "is followed by" checks).
CREATE POLICY "Anyone can view follows"
  ON public.author_followers FOR SELECT USING (true);
CREATE POLICY "Users insert own follow"
  ON public.author_followers FOR INSERT WITH CHECK (auth.uid() = follower_user_id);
CREATE POLICY "Users delete own follow"
  ON public.author_followers FOR DELETE USING (auth.uid() = follower_user_id);

-- ===== Recommendation feedback =====
CREATE TABLE IF NOT EXISTS public.recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text,
  source text NOT NULL,           -- trending, top_selling, related, same_author, same_series, collection, continue_reading
  action text NOT NULL CHECK (action IN ('shown','clicked','sampled','purchased','hidden')),
  listing_id uuid,
  book_id uuid,
  position int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recfb_source_created ON public.recommendation_feedback(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recfb_user ON public.recommendation_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recfb_listing ON public.recommendation_feedback(listing_id);

ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rec feedback"
  ON public.recommendation_feedback FOR SELECT USING (auth.uid() = user_id);
-- No insert/update/delete policies → only service role writes.
