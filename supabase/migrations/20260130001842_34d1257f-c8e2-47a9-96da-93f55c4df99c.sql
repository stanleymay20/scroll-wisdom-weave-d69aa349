-- Historical learning-feature reconciliation migration.
-- Several of these tables existed before this migration. The original script
-- used CREATE TABLE IF NOT EXISTS but then recreated policies/triggers
-- unconditionally and silently skipped later columns when a table already
-- existed. Reconcile the intended shape without dropping existing data or RLS.

-- saved_learning_decks
CREATE TABLE IF NOT EXISTS public.saved_learning_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  scope TEXT DEFAULT 'chapter',
  chapters_covered INTEGER[] DEFAULT '{}',
  deck_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  slide_count INTEGER DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.saved_learning_decks
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'chapter',
  ADD COLUMN IF NOT EXISTS chapters_covered INTEGER[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deck_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS slide_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;
ALTER TABLE public.saved_learning_decks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own learning decks" ON public.saved_learning_decks;
CREATE POLICY "Users can manage own learning decks" ON public.saved_learning_decks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- faqs
CREATE TABLE IF NOT EXISTS public.faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FAQs are viewable by everyone" ON public.faqs;
CREATE POLICY "FAQs are viewable by everyone" ON public.faqs FOR SELECT USING (is_published = true);

-- assessment_integrity_logs already has a richer Contract 6D schema in clean
-- installs. Preserve it and add only the compatibility payload fields.
CREATE TABLE IF NOT EXISTS public.assessment_integrity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  integrity_score NUMERIC DEFAULT 1,
  violation_type TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.assessment_integrity_logs
  ADD COLUMN IF NOT EXISTS violation_type TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.assessment_integrity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own integrity logs" ON public.assessment_integrity_logs;
DROP POLICY IF EXISTS "System can create logs" ON public.assessment_integrity_logs;
CREATE POLICY "Users can view own integrity logs" ON public.assessment_integrity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can create logs" ON public.assessment_integrity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- publishing_certificates also predates this migration. Preserve its stronger
-- certificate contract and add compatibility fields only.
CREATE TABLE IF NOT EXISTS public.publishing_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  certificate_number TEXT NOT NULL UNIQUE,
  certificate_type TEXT DEFAULT 'completion',
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revocation_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.publishing_certificates
  ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;
ALTER TABLE public.publishing_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Certificates are viewable by everyone" ON public.publishing_certificates;
DROP POLICY IF EXISTS "Users can manage own certificates" ON public.publishing_certificates;
CREATE POLICY "Certificates are viewable by everyone" ON public.publishing_certificates FOR SELECT USING (true);
CREATE POLICY "Users can manage own certificates" ON public.publishing_certificates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- book_citations
CREATE TABLE IF NOT EXISTS public.book_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  citation_text TEXT NOT NULL,
  citation_type TEXT DEFAULT 'reference',
  source_url TEXT,
  author TEXT,
  publication_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.book_citations
  ADD COLUMN IF NOT EXISTS citation_type TEXT DEFAULT 'reference',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS publication_date TEXT;
ALTER TABLE public.book_citations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Citations viewable with book" ON public.book_citations;
DROP POLICY IF EXISTS "Users can manage own book citations" ON public.book_citations;
CREATE POLICY "Citations viewable with book" ON public.book_citations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND (is_published = true OR user_id = auth.uid()))
);
CREATE POLICY "Users can manage own book citations" ON public.book_citations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
);

-- reading_streaks
CREATE TABLE IF NOT EXISTS public.reading_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_read_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.reading_streaks
  ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_read_date DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;
ALTER TABLE public.reading_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own streaks" ON public.reading_streaks;
CREATE POLICY "Users can manage own streaks" ON public.reading_streaks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- highlights existed in the initial schema with excerpt instead of content and
-- without an explicit book_id. Reconcile the newer shape non-destructively.
CREATE TABLE IF NOT EXISTS public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  content TEXT,
  note TEXT,
  color TEXT DEFAULT 'yellow',
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.highlights
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'yellow',
  ADD COLUMN IF NOT EXISTS start_offset INTEGER,
  ADD COLUMN IF NOT EXISTS end_offset INTEGER;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'highlights' AND column_name = 'excerpt'
  ) THEN
    UPDATE public.highlights SET content = excerpt WHERE content IS NULL;
  END IF;
END
$$;
UPDATE public.highlights h
SET book_id = c.book_id
FROM public.chapters c
WHERE h.book_id IS NULL AND h.chapter_id = c.id;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own highlights" ON public.highlights;
CREATE POLICY "Users can manage own highlights" ON public.highlights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- bookmarks
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  chapter_number INTEGER,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
ALTER TABLE public.bookmarks
  ADD COLUMN IF NOT EXISTS chapter_number INTEGER,
  ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can manage own bookmarks" ON public.bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers must be replay-safe when a prior migration already
-- attached an equivalent trigger.
DROP TRIGGER IF EXISTS update_saved_learning_decks_updated_at ON public.saved_learning_decks;
DROP TRIGGER IF EXISTS update_reading_streaks_updated_at ON public.reading_streaks;
CREATE TRIGGER update_saved_learning_decks_updated_at BEFORE UPDATE ON public.saved_learning_decks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reading_streaks_updated_at BEFORE UPDATE ON public.reading_streaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();