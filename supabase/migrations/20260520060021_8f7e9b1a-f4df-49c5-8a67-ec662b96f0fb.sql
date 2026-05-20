
-- author_profiles
CREATE TABLE public.author_profiles (
  user_id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  x_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Author profiles are publicly viewable" ON public.author_profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own author profile" ON public.author_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own author profile" ON public.author_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_author_profiles_updated_at BEFORE UPDATE ON public.author_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- book_series
CREATE TABLE public.book_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.book_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Series are publicly viewable" ON public.book_series FOR SELECT USING (true);
CREATE POLICY "Users can manage own series" ON public.book_series FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_book_series_updated_at BEFORE UPDATE ON public.book_series FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- public_listings
CREATE TABLE public.public_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  sample_chapters INTEGER NOT NULL DEFAULT 1,
  blurb TEXT,
  subtitle TEXT,
  amazon_description TEXT,
  seo_keywords TEXT[] NOT NULL DEFAULT '{}',
  seo_categories TEXT[] NOT NULL DEFAULT '{}',
  backend_keywords TEXT[] NOT NULL DEFAULT '{}',
  license_type TEXT NOT NULL DEFAULT 'personal' CHECK (license_type IN ('personal','commercial','educational','institutional','resale')),
  series_id UUID REFERENCES public.book_series(id) ON DELETE SET NULL,
  series_order INTEGER,
  cover_override_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.public_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public listings viewable when public" ON public.public_listings FOR SELECT USING (
  is_public = true OR EXISTS (SELECT 1 FROM public.books b WHERE b.id = public_listings.book_id AND b.user_id = auth.uid())
);
CREATE POLICY "Owners can manage own listings" ON public.public_listings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.books b WHERE b.id = public_listings.book_id AND b.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.books b WHERE b.id = public_listings.book_id AND b.user_id = auth.uid())
);
CREATE TRIGGER update_public_listings_updated_at BEFORE UPDATE ON public.public_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_public_listings_slug ON public.public_listings(slug);
CREATE INDEX idx_public_listings_public ON public.public_listings(is_public) WHERE is_public = true;

-- purchase_intents (no direct insert; edge fn only)
CREATE TABLE public.purchase_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.public_listings(id) ON DELETE CASCADE,
  buyer_email TEXT,
  buyer_ip TEXT,
  source TEXT NOT NULL CHECK (source IN ('storefront','kdp','gumroad','linkedin')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can view purchase intents for their listings" ON public.purchase_intents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.id = purchase_intents.listing_id AND b.user_id = auth.uid()
  )
);

-- storefront_events
CREATE TABLE public.storefront_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.public_listings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  user_id UUID,
  session_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.storefront_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert storefront events" ON public.storefront_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view events for their listings" ON public.storefront_events FOR SELECT USING (
  listing_id IS NULL OR EXISTS (
    SELECT 1 FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.id = storefront_events.listing_id AND b.user_id = auth.uid()
  )
);
CREATE POLICY "Admins view all storefront events" ON public.storefront_events FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_storefront_events_listing ON public.storefront_events(listing_id, created_at DESC);

-- export_jobs
CREATE TABLE public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID NOT NULL,
  listing_id UUID REFERENCES public.public_listings(id) ON DELETE SET NULL,
  bundle_type TEXT NOT NULL CHECK (bundle_type IN ('kdp','gumroad')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  result_url TEXT,
  result_expires_at TIMESTAMPTZ,
  error_message TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own export jobs" ON public.export_jobs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_export_jobs_updated_at BEFORE UPDATE ON public.export_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_export_jobs_user ON public.export_jobs(user_id, created_at DESC);

-- exports storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('exports','exports', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Users can read own export files" ON storage.objects FOR SELECT USING (
  bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Users can upload own export files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]
);
