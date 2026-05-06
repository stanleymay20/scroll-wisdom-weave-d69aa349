
-- EPIE: Publishing Audits
CREATE TABLE public.publishing_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  layer text NOT NULL DEFAULT 'all',
  certification_tier text,
  publish_readiness_score numeric DEFAULT 0,
  human_authenticity_score numeric DEFAULT 0,
  engagement_score numeric DEFAULT 0,
  strategic_depth_score numeric DEFAULT 0,
  commercial_score numeric DEFAULT 0,
  citation_confidence_score numeric DEFAULT 0,
  formatting_score numeric DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publishing_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own publishing audits"
  ON public.publishing_audits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all publishing audits"
  ON public.publishing_audits FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_publishing_audits_updated_at
  BEFORE UPDATE ON public.publishing_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_publishing_audits_book ON public.publishing_audits(book_id);

-- EPIE: Humanization Passes
CREATE TABLE public.humanization_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  chapter_id uuid,
  user_id uuid NOT NULL,
  pattern_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  authenticity_delta numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.humanization_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own humanization passes"
  ON public.humanization_passes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_humanization_book ON public.humanization_passes(book_id);

-- EPIE: Citation Flags
CREATE TABLE public.citation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  chapter_id uuid,
  user_id uuid NOT NULL,
  claim_text text NOT NULL,
  flag_type text NOT NULL DEFAULT 'unsupported',
  severity text NOT NULL DEFAULT 'medium',
  suggested_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_citation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.citation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own citation flags"
  ON public.citation_flags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_citation_flags_updated_at
  BEFORE UPDATE ON public.citation_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_citation_flags_book ON public.citation_flags(book_id);

-- EPIE: Publishing Readiness Snapshots
CREATE TABLE public.publishing_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  user_id uuid NOT NULL,
  audit_id uuid,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  certification_tier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.publishing_readiness_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own readiness snapshots"
  ON public.publishing_readiness_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_readiness_book ON public.publishing_readiness_snapshots(book_id);
