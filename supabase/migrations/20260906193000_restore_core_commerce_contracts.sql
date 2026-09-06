-- Controlled catch-up for the production database that pre-dates the storefront
-- and commerce migration era. This creates only contracts used by the current
-- public storefront, checkout, Stripe webhook, risk gate and creator ledger.
-- It intentionally uses idempotent/guarded DDL so newer environments are safe.

-- ---------------------------------------------------------------------------
-- Storefront identity and listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.author_profiles (
  user_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  website_url text,
  linkedin_url text,
  x_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.author_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.author_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.author_profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.author_profiles TO authenticated;
GRANT ALL ON TABLE public.author_profiles TO service_role;
DROP POLICY IF EXISTS "Author profiles are publicly viewable" ON public.author_profiles;
DROP POLICY IF EXISTS "Users can insert own author profile" ON public.author_profiles;
DROP POLICY IF EXISTS "Users can update own author profile" ON public.author_profiles;
CREATE POLICY "Author profiles are publicly viewable" ON public.author_profiles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can insert own author profile" ON public.author_profiles
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own author profile" ON public.author_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP TRIGGER IF EXISTS update_author_profiles_updated_at ON public.author_profiles;
CREATE TRIGGER update_author_profiles_updated_at
  BEFORE UPDATE ON public.author_profiles FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.book_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.book_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_series FROM anon, authenticated;
GRANT SELECT ON TABLE public.book_series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.book_series TO authenticated;
GRANT ALL ON TABLE public.book_series TO service_role;
DROP POLICY IF EXISTS "Series are publicly viewable" ON public.book_series;
DROP POLICY IF EXISTS "Users can manage own series" ON public.book_series;
CREATE POLICY "Series are publicly viewable" ON public.book_series
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can manage own series" ON public.book_series
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP TRIGGER IF EXISTS update_book_series_updated_at ON public.book_series;
CREATE TRIGGER update_book_series_updated_at
  BEFORE UPDATE ON public.book_series FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.public_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  sample_chapters integer NOT NULL DEFAULT 1 CHECK (sample_chapters >= 0),
  blurb text,
  subtitle text,
  amazon_description text,
  seo_keywords text[] NOT NULL DEFAULT '{}',
  seo_categories text[] NOT NULL DEFAULT '{}',
  backend_keywords text[] NOT NULL DEFAULT '{}',
  license_type text NOT NULL DEFAULT 'personal'
    CHECK (license_type IN ('personal','commercial','educational','institutional','resale')),
  series_id uuid REFERENCES public.book_series(id) ON DELETE SET NULL,
  series_order integer,
  cover_override_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.public_listings'::regclass
      AND conname='public_listings_book_id_fkey'
  ) THEN
    ALTER TABLE public.public_listings
      ADD CONSTRAINT public_listings_book_id_fkey
      FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_public_listings_slug ON public.public_listings(slug);
CREATE INDEX IF NOT EXISTS idx_public_listings_public ON public.public_listings(is_public) WHERE is_public = true;
ALTER TABLE public.public_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_listings FROM anon, authenticated;
GRANT SELECT ON TABLE public.public_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_listings TO authenticated;
GRANT ALL ON TABLE public.public_listings TO service_role;
DROP POLICY IF EXISTS "Public listings viewable when public" ON public.public_listings;
DROP POLICY IF EXISTS "Owners can manage own listings" ON public.public_listings;
CREATE POLICY "Public listings viewable when public" ON public.public_listings
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true OR EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = public_listings.book_id AND b.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Owners can manage own listings" ON public.public_listings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = public_listings.book_id AND b.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = public_listings.book_id AND b.user_id = (SELECT auth.uid())
  ));
DROP TRIGGER IF EXISTS update_public_listings_updated_at ON public.public_listings;
CREATE TRIGGER update_public_listings_updated_at
  BEFORE UPDATE ON public.public_listings FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.purchase_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.public_listings(id) ON DELETE CASCADE,
  buyer_email text,
  buyer_ip text,
  source text NOT NULL CHECK (source IN ('storefront','kdp','gumroad','linkedin')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_intents FROM anon, authenticated;
GRANT SELECT ON TABLE public.purchase_intents TO authenticated;
GRANT ALL ON TABLE public.purchase_intents TO service_role;
DROP POLICY IF EXISTS "Owners can view purchase intents for their listings" ON public.purchase_intents;
CREATE POLICY "Owners can view purchase intents for their listings" ON public.purchase_intents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.id = purchase_intents.listing_id AND b.user_id = (SELECT auth.uid())
  ));

CREATE TABLE IF NOT EXISTS public.storefront_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.public_listings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  user_id uuid,
  session_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_storefront_events_listing ON public.storefront_events(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_type_created ON public.storefront_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_session_created ON public.storefront_events(session_id, created_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_events_user_created ON public.storefront_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
ALTER TABLE public.storefront_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.storefront_events TO anon, authenticated;
GRANT ALL ON TABLE public.storefront_events TO service_role;
DROP POLICY IF EXISTS "Anyone can insert storefront events" ON public.storefront_events;
DROP POLICY IF EXISTS "Owners can view events for their listings" ON public.storefront_events;
DROP POLICY IF EXISTS "Admins view all storefront events" ON public.storefront_events;
CREATE POLICY "Anyone can insert storefront events" ON public.storefront_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));
CREATE POLICY "Owners can view events for their listings" ON public.storefront_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.id = storefront_events.listing_id AND b.user_id = (SELECT auth.uid())
  ));
CREATE POLICY "Admins view all storefront events" ON public.storefront_events
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.public_listings(id) ON DELETE SET NULL,
  bundle_type text NOT NULL CHECK (bundle_type IN ('kdp','gumroad')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  progress integer NOT NULL DEFAULT 0,
  result_url text,
  result_expires_at timestamptz,
  error_message text,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  correlation_id text,
  dead_letter_reason text,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON public.export_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created ON public.export_jobs(status, created_at DESC);
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.export_jobs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.export_jobs TO authenticated;
GRANT ALL ON TABLE public.export_jobs TO service_role;
DROP POLICY IF EXISTS "Users manage own export jobs" ON public.export_jobs;
CREATE POLICY "Users manage own export jobs" ON public.export_jobs
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP TRIGGER IF EXISTS update_export_jobs_updated_at ON public.export_jobs;
CREATE TRIGGER update_export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('exports','exports',false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Users can read own export files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own export files" ON storage.objects;
CREATE POLICY "Users can read own export files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='exports' AND (SELECT auth.uid())::text=(storage.foldername(name))[1]);
CREATE POLICY "Users can upload own export files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='exports' AND (SELECT auth.uid())::text=(storage.foldername(name))[1]);

-- ---------------------------------------------------------------------------
-- Purchases and buyer access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.public_listings(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  buyer_user_id uuid,
  buyer_email text,
  stripe_session_id text,
  stripe_payment_intent text,
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed')),
  purchased_at timestamptz,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS book_purchases_stripe_session_uidx
  ON public.book_purchases(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS book_purchases_paid_unique_uidx
  ON public.book_purchases(buyer_user_id, book_id)
  WHERE status='paid' AND buyer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS book_purchases_buyer_book_status_idx
  ON public.book_purchases(buyer_user_id, book_id, status);
CREATE INDEX IF NOT EXISTS idx_book_purchases_listing ON public.book_purchases(listing_id);
ALTER TABLE public.book_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_purchases FROM anon, authenticated;
GRANT SELECT ON TABLE public.book_purchases TO authenticated;
GRANT ALL ON TABLE public.book_purchases TO service_role;
DROP POLICY IF EXISTS "Buyers can view own purchases" ON public.book_purchases;
DROP POLICY IF EXISTS "Book owners can view purchases of their books" ON public.book_purchases;
DROP POLICY IF EXISTS "Admins can view all purchases" ON public.book_purchases;
CREATE POLICY "Buyers can view own purchases" ON public.book_purchases
  FOR SELECT TO authenticated USING (buyer_user_id=(SELECT auth.uid()));
CREATE POLICY "Book owners can view purchases of their books" ON public.book_purchases
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id=book_purchases.book_id AND b.user_id=(SELECT auth.uid())
  ));
CREATE POLICY "Admins can view all purchases" ON public.book_purchases
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS update_book_purchases_updated_at ON public.book_purchases;
CREATE TRIGGER update_book_purchases_updated_at
  BEFORE UPDATE ON public.book_purchases FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.user_owns_book_purchase(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL
     AND v_caller <> _user_id
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.book_purchases
    WHERE buyer_user_id=_user_id AND book_id=_book_id AND status='paid'
  );
END $$;
REVOKE ALL ON FUNCTION public.user_owns_book_purchase(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_book_purchase(uuid,uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS "Buyers can read full chapters of purchased books" ON public.chapters;
CREATE POLICY "Buyers can read full chapters of purchased books" ON public.chapters
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase((SELECT auth.uid()), book_id));
DROP POLICY IF EXISTS "Buyers can read purchased books" ON public.books;
CREATE POLICY "Buyers can read purchased books" ON public.books
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase((SELECT auth.uid()), id));

-- ---------------------------------------------------------------------------
-- Attribution used by checkout/webhook stitching
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  user_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  first_touch_referrer text,
  first_touch_landing_path text,
  utm_term text,
  utm_content text,
  ip_hash text,
  country_code text,
  user_agent_family text,
  user_agent_hash text,
  device_class text,
  events_count integer NOT NULL DEFAULT 0,
  converted_purchase_id uuid,
  converted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_attribution_user ON public.attribution_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attribution_source ON public.attribution_sessions(first_touch_source);
CREATE INDEX IF NOT EXISTS idx_attribution_first_seen ON public.attribution_sessions(first_seen_at DESC);
ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attribution_sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.attribution_sessions TO authenticated;
GRANT ALL ON TABLE public.attribution_sessions TO service_role;
DROP POLICY IF EXISTS "admins read attribution_sessions" ON public.attribution_sessions;
DROP POLICY IF EXISTS "users read own attribution_sessions" ON public.attribution_sessions;
CREATE POLICY "admins read attribution_sessions" ON public.attribution_sessions
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE POLICY "users read own attribution_sessions" ON public.attribution_sessions
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Financial observability and atomic Stripe webhook claim
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('system','admin','user','webhook')),
  correlation_id text,
  purchase_id uuid,
  stripe_event_id text,
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  dead_letter_reason text,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_events_type_created_idx ON public.financial_events(event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS financial_events_correlation_idx ON public.financial_events(correlation_id) WHERE correlation_id IS NOT NULL;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.financial_events TO authenticated;
GRANT ALL ON TABLE public.financial_events TO service_role;
DROP POLICY IF EXISTS "admins read financial_events" ON public.financial_events;
CREATE POLICY "admins read financial_events" ON public.financial_events
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.block_financial_events_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'financial_events is append-only (op=%)', TG_OP; END $$;
DROP TRIGGER IF EXISTS financial_events_no_update ON public.financial_events;
CREATE TRIGGER financial_events_no_update
  BEFORE UPDATE OR DELETE ON public.financial_events FOR EACH ROW
  EXECUTE FUNCTION public.block_financial_events_mutation();

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','processed','failed','replayed','dead_lettered')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  correlation_id text,
  dead_letter_reason text,
  dead_lettered_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx ON public.stripe_webhook_events(status,received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx ON public.stripe_webhook_events(event_type,received_at DESC);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.stripe_webhook_events TO authenticated;
GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;
DROP POLICY IF EXISTS "admins read stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "admins read stripe_webhook_events" ON public.stripe_webhook_events
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  _stripe_event_id text,
  _event_type text,
  _payload jsonb,
  _correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_row public.stripe_webhook_events%ROWTYPE;
BEGIN
  IF _stripe_event_id IS NULL OR length(_stripe_event_id)=0 THEN
    RAISE EXCEPTION 'stripe_event_id_required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_stripe_event_id, 0));

  SELECT * INTO v_row FROM public.stripe_webhook_events
  WHERE stripe_event_id=_stripe_event_id;

  IF NOT FOUND THEN
    INSERT INTO public.stripe_webhook_events(
      stripe_event_id,event_type,payload,status,attempts,correlation_id,received_at,updated_at
    ) VALUES (
      _stripe_event_id,_event_type,_payload,'processing',1,_correlation_id,now(),now()
    );
    RETURN jsonb_build_object('claimed',true,'attempts',1,'status','processing');
  END IF;

  IF v_row.status IN ('processed','replayed') THEN
    RETURN jsonb_build_object('claimed',false,'terminal',true,'status',v_row.status,'attempts',v_row.attempts);
  END IF;

  IF v_row.status='processing' AND v_row.updated_at > now()-interval '5 minutes' THEN
    RETURN jsonb_build_object('claimed',false,'in_flight',true,'status','processing','attempts',v_row.attempts);
  END IF;

  UPDATE public.stripe_webhook_events
  SET status='processing',
      attempts=COALESCE(attempts,0)+1,
      event_type=_event_type,
      payload=_payload,
      correlation_id=_correlation_id,
      last_error=NULL,
      updated_at=now()
  WHERE stripe_event_id=_stripe_event_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('claimed',true,'attempts',v_row.attempts,'status','processing');
END $$;
REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text,text,jsonb,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.export_job_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  phase text NOT NULL,
  duration_ms integer,
  memory_mb numeric,
  error_code text,
  correlation_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.export_job_telemetry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.export_job_telemetry FROM anon,authenticated;
GRANT SELECT ON TABLE public.export_job_telemetry TO authenticated;
GRANT ALL ON TABLE public.export_job_telemetry TO service_role;
DROP POLICY IF EXISTS "admins read export_job_telemetry" ON public.export_job_telemetry;
DROP POLICY IF EXISTS "owners read their export_job_telemetry" ON public.export_job_telemetry;
CREATE POLICY "admins read export_job_telemetry" ON public.export_job_telemetry
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
CREATE POLICY "owners read their export_job_telemetry" ON public.export_job_telemetry
  FOR SELECT TO authenticated USING (EXISTS(
    SELECT 1 FROM public.export_jobs ej
    WHERE ej.id=export_job_telemetry.job_id AND ej.user_id=(SELECT auth.uid())
  ));

CREATE TABLE IF NOT EXISTS public.chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id text UNIQUE NOT NULL,
  purchase_id uuid REFERENCES public.book_purchases(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  reason text,
  status text NOT NULL DEFAULT 'needs_response',
  evidence_due_by timestamptz,
  correlation_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chargebacks FROM anon,authenticated;
GRANT SELECT ON TABLE public.chargebacks TO authenticated;
GRANT ALL ON TABLE public.chargebacks TO service_role;
DROP POLICY IF EXISTS "admins read chargebacks" ON public.chargebacks;
CREATE POLICY "admins read chargebacks" ON public.chargebacks
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
DROP TRIGGER IF EXISTS chargebacks_set_updated_at ON public.chargebacks;
CREATE TRIGGER chargebacks_set_updated_at
  BEFORE UPDATE ON public.chargebacks FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','ip','email','device','book','listing')),
  subject_value text NOT NULL,
  signal_type text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'system',
  correlation_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fraud_signals FROM anon,authenticated;
GRANT SELECT ON TABLE public.fraud_signals TO authenticated;
GRANT ALL ON TABLE public.fraud_signals TO service_role;
DROP POLICY IF EXISTS "admins read fraud_signals" ON public.fraud_signals;
CREATE POLICY "admins read fraud_signals" ON public.fraud_signals
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.alert_thresholds (
  key text PRIMARY KEY,
  description text,
  warn_value numeric,
  critical_value numeric,
  window_seconds integer NOT NULL DEFAULT 300,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alert_thresholds FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.alert_thresholds TO authenticated;
GRANT ALL ON TABLE public.alert_thresholds TO service_role;
DROP POLICY IF EXISTS "admins manage alert_thresholds" ON public.alert_thresholds;
CREATE POLICY "admins manage alert_thresholds" ON public.alert_thresholds
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
INSERT INTO public.alert_thresholds(key,description,warn_value,critical_value,window_seconds)
VALUES
 ('webhook.failures','Failed Stripe webhook deliveries within window',3,5,300),
 ('export.failure_rate_pct','Percentage of export jobs failing within window',10,25,900),
 ('ledger.discrepancies','Discrepancies between purchases and creator ledger',1,5,86400),
 ('chargebacks.rate_24h','Chargebacks received in last 24 hours',1,3,86400)
ON CONFLICT(key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Persistent checkout velocity + buyer risk state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.velocity_buckets (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.velocity_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.velocity_buckets FROM anon,authenticated;
GRANT SELECT ON TABLE public.velocity_buckets TO authenticated;
GRANT ALL ON TABLE public.velocity_buckets TO service_role;
DROP POLICY IF EXISTS "admins read velocity_buckets" ON public.velocity_buckets;
CREATE POLICY "admins read velocity_buckets" ON public.velocity_buckets
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.check_velocity(_key text,_limit integer,_window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_now timestamptz:=now();
  v_row public.velocity_buckets%ROWTYPE;
BEGIN
  IF _limit<=0 OR _window_seconds<=0 THEN RAISE EXCEPTION 'invalid_velocity_config'; END IF;
  INSERT INTO public.velocity_buckets(key,window_start,count,updated_at)
  VALUES(_key,v_now,1,v_now)
  ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN public.velocity_buckets.window_start+make_interval(secs=>_window_seconds)<v_now
      THEN 1 ELSE public.velocity_buckets.count+1 END,
    window_start=CASE WHEN public.velocity_buckets.window_start+make_interval(secs=>_window_seconds)<v_now
      THEN v_now ELSE public.velocity_buckets.window_start END,
    updated_at=v_now
  RETURNING * INTO v_row;
  IF v_row.count>_limit THEN
    RETURN jsonb_build_object('ok',false,'count',v_row.count,'limit',_limit,
      'retry_after',GREATEST(1,_window_seconds-EXTRACT(epoch FROM (v_now-v_row.window_start))::integer));
  END IF;
  RETURN jsonb_build_object('ok',true,'count',v_row.count,'limit',_limit);
END $$;
REVOKE ALL ON FUNCTION public.check_velocity(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_velocity(text,integer,integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.user_risk_scores (
  user_id uuid PRIMARY KEY,
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  tier text NOT NULL DEFAULT 'low' CHECK (tier IN ('low','medium','high','blocked')),
  reasons jsonb NOT NULL DEFAULT '[]',
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  manual_override_tier text CHECK (manual_override_tier IN ('low','medium','high','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_risk_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_risk_scores FROM anon,authenticated;
GRANT SELECT ON TABLE public.user_risk_scores TO authenticated;
GRANT ALL ON TABLE public.user_risk_scores TO service_role;
DROP POLICY IF EXISTS "admins read user_risk_scores" ON public.user_risk_scores;
DROP POLICY IF EXISTS "users read own risk score" ON public.user_risk_scores;
CREATE POLICY "admins read user_risk_scores" ON public.user_risk_scores
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
CREATE POLICY "users read own risk score" ON public.user_risk_scores
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Creator ledger required by checkout/webhook
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_config FROM anon,authenticated;
GRANT SELECT ON TABLE public.platform_config TO authenticated;
GRANT ALL ON TABLE public.platform_config TO service_role;
DROP POLICY IF EXISTS "Authenticated can read fee config" ON public.platform_config;
DROP POLICY IF EXISTS "Admins can read all config" ON public.platform_config;
CREATE POLICY "Authenticated can read fee config" ON public.platform_config
  FOR SELECT TO authenticated USING (key='revenue.platform_fee_bps');
CREATE POLICY "Admins can read all config" ON public.platform_config
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));
INSERT INTO public.platform_config(key,value)
VALUES('revenue.platform_fee_bps',jsonb_build_object('bps',1500))
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.creator_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  creator_user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  listing_id uuid,
  entry_type text NOT NULL CHECK (entry_type IN ('sale','refund','chargeback','adjustment')),
  gross_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL,
  creator_net_cents integer NOT NULL,
  fee_bps_applied integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  base_currency text,
  exchange_rate_snapshot numeric,
  payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending','available','paid_out','held','void')),
  payout_batch_id uuid,
  available_at timestamptz,
  hold_reason text,
  chargeback_status text,
  book_title_snapshot text,
  creator_display_name_snapshot text,
  listing_slug_snapshot text,
  risk_score numeric,
  fraud_flags jsonb NOT NULL DEFAULT '[]',
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(purchase_id,entry_type)
);
CREATE INDEX IF NOT EXISTS idx_earnings_creator_time ON public.creator_earnings_ledger(creator_user_id,occurred_at DESC);
ALTER TABLE public.creator_earnings_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_earnings_ledger FROM anon,authenticated;
GRANT SELECT ON TABLE public.creator_earnings_ledger TO authenticated;
GRANT SELECT,INSERT ON TABLE public.creator_earnings_ledger TO service_role;
DROP POLICY IF EXISTS "Creators read own earnings" ON public.creator_earnings_ledger;
DROP POLICY IF EXISTS "Admins read all earnings" ON public.creator_earnings_ledger;
CREATE POLICY "Creators read own earnings" ON public.creator_earnings_ledger
  FOR SELECT TO authenticated USING (creator_user_id=(SELECT auth.uid()));
CREATE POLICY "Admins read all earnings" ON public.creator_earnings_ledger
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.creator_revenue_daily (
  creator_user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  day date NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  gross_cents bigint NOT NULL DEFAULT 0,
  refund_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL DEFAULT 0,
  platform_fee_cents bigint NOT NULL DEFAULT 0,
  sales_count integer NOT NULL DEFAULT 0,
  refund_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(creator_user_id,book_id,day,currency)
);
ALTER TABLE public.creator_revenue_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_revenue_daily FROM anon,authenticated;
GRANT SELECT ON TABLE public.creator_revenue_daily TO authenticated;
GRANT ALL ON TABLE public.creator_revenue_daily TO service_role;
DROP POLICY IF EXISTS "Creators read own daily revenue" ON public.creator_revenue_daily;
DROP POLICY IF EXISTS "Admins read all daily revenue" ON public.creator_revenue_daily;
CREATE POLICY "Creators read own daily revenue" ON public.creator_revenue_daily
  FOR SELECT TO authenticated USING (creator_user_id=(SELECT auth.uid()));
CREATE POLICY "Admins read all daily revenue" ON public.creator_revenue_daily
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()),'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.record_purchase_ledger(_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_p record; v_b record; v_l record; v_a record;
  v_fee_bps integer:=1500; v_gross integer; v_fee integer; v_net integer; v_day date;
  v_sale_exists boolean; v_refund_exists boolean;
BEGIN
  SELECT * INTO v_p FROM public.book_purchases WHERE id=_purchase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','purchase_not_found'); END IF;
  SELECT id,user_id,title INTO v_b FROM public.books WHERE id=v_p.book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','book_not_found'); END IF;
  SELECT id,slug INTO v_l FROM public.public_listings WHERE id=v_p.listing_id;
  SELECT display_name INTO v_a FROM public.author_profiles WHERE user_id=v_b.user_id;
  SELECT COALESCE((value->>'bps')::integer,1500) INTO v_fee_bps
    FROM public.platform_config WHERE key='revenue.platform_fee_bps';
  v_fee_bps:=COALESCE(v_fee_bps,1500);
  v_gross:=COALESCE(v_p.amount_cents,0);
  v_fee:=(v_gross::numeric*v_fee_bps/10000)::integer;
  v_net:=v_gross-v_fee;
  v_day:=COALESCE((v_p.purchased_at AT TIME ZONE 'UTC')::date,(now() AT TIME ZONE 'UTC')::date);
  SELECT EXISTS(SELECT 1 FROM public.creator_earnings_ledger WHERE purchase_id=_purchase_id AND entry_type='sale') INTO v_sale_exists;
  SELECT EXISTS(SELECT 1 FROM public.creator_earnings_ledger WHERE purchase_id=_purchase_id AND entry_type IN('refund','chargeback')) INTO v_refund_exists;
  IF NOT v_sale_exists AND v_p.status IN('paid','refunded') THEN
    INSERT INTO public.creator_earnings_ledger(
      purchase_id,creator_user_id,book_id,listing_id,entry_type,gross_cents,
      platform_fee_cents,creator_net_cents,fee_bps_applied,currency,base_currency,
      payout_status,available_at,book_title_snapshot,creator_display_name_snapshot,
      listing_slug_snapshot,occurred_at,metadata
    ) VALUES(
      _purchase_id,v_b.user_id,v_p.book_id,v_p.listing_id,'sale',v_gross,v_fee,v_net,
      v_fee_bps,v_p.currency,v_p.currency,'pending',COALESCE(v_p.purchased_at,now())+interval '14 days',
      v_b.title,COALESCE(v_a.display_name,''),COALESCE(v_l.slug,''),COALESCE(v_p.purchased_at,now()),
      jsonb_build_object('source','record_purchase_ledger')
    ) ON CONFLICT(purchase_id,entry_type) DO NOTHING;
    INSERT INTO public.creator_revenue_daily(
      creator_user_id,book_id,day,currency,gross_cents,platform_fee_cents,net_cents,sales_count
    ) VALUES(v_b.user_id,v_p.book_id,v_day,v_p.currency,v_gross,v_fee,v_net,1)
    ON CONFLICT(creator_user_id,book_id,day,currency) DO UPDATE SET
      gross_cents=creator_revenue_daily.gross_cents+EXCLUDED.gross_cents,
      platform_fee_cents=creator_revenue_daily.platform_fee_cents+EXCLUDED.platform_fee_cents,
      net_cents=creator_revenue_daily.net_cents+EXCLUDED.net_cents,
      sales_count=creator_revenue_daily.sales_count+1,updated_at=now();
  END IF;
  IF v_p.status='refunded' AND NOT v_refund_exists THEN
    INSERT INTO public.creator_earnings_ledger(
      purchase_id,creator_user_id,book_id,listing_id,entry_type,gross_cents,
      platform_fee_cents,creator_net_cents,fee_bps_applied,currency,base_currency,
      payout_status,book_title_snapshot,creator_display_name_snapshot,listing_slug_snapshot,
      occurred_at,metadata
    ) VALUES(
      _purchase_id,v_b.user_id,v_p.book_id,v_p.listing_id,'refund',-v_gross,-v_fee,-v_net,
      v_fee_bps,v_p.currency,v_p.currency,'void',v_b.title,COALESCE(v_a.display_name,''),
      COALESCE(v_l.slug,''),now(),jsonb_build_object('source','record_purchase_ledger_refund')
    ) ON CONFLICT(purchase_id,entry_type) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('ok',true,'creator_user_id',v_b.user_id,'fee_bps',v_fee_bps);
END $$;
REVOKE ALL ON FUNCTION public.record_purchase_ledger(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_ledger(uuid) TO service_role;
