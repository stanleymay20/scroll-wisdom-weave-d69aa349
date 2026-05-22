
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- search_queries
CREATE TABLE IF NOT EXISTS public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  user_id UUID,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  clicked_book_id UUID,
  source TEXT NOT NULL DEFAULT 'storefront',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert search queries"
  ON public.search_queries FOR INSERT WITH CHECK (true);

CREATE POLICY "Users read own search queries"
  ON public.search_queries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all search queries"
  ON public.search_queries FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_search_queries_normalized
  ON public.search_queries(normalized_query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_created
  ON public.search_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_zero_results
  ON public.search_queries(normalized_query, created_at DESC)
  WHERE results_count = 0;
CREATE INDEX IF NOT EXISTS idx_search_queries_clicked
  ON public.search_queries(clicked_book_id, created_at DESC)
  WHERE clicked_book_id IS NOT NULL;

-- Trigram indexes to make weighted ILIKE/similarity searches sub-linear.
CREATE INDEX IF NOT EXISTS idx_books_title_trgm
  ON public.books USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_author_profiles_name_trgm
  ON public.author_profiles USING GIN (display_name gin_trgm_ops);

-- discovery_weights: admin-tunable ranking knobs.
CREATE TABLE IF NOT EXISTS public.discovery_weights (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.discovery_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read discovery_weights"
  ON public.discovery_weights FOR SELECT USING (true);
CREATE POLICY "Admins manage discovery_weights"
  ON public.discovery_weights FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.discovery_weights(key, value, description) VALUES
  ('w_view', 1, 'storefront listing_view weight'),
  ('w_sample', 3, 'sample_open weight'),
  ('w_cta', 5, 'cta_click weight'),
  ('w_checkout', 8, 'checkout_started weight'),
  ('w_purchase', 25, 'purchase_completed weight'),
  ('w_refund_penalty', 25, 'penalty per refund'),
  ('w_fraud_penalty', 50, 'penalty per fraud signal'),
  ('w_freshness_days', 14, 'days window for freshness boost'),
  ('w_freshness_boost', 8, 'max freshness boost for brand-new listings')
ON CONFLICT (key) DO NOTHING;
