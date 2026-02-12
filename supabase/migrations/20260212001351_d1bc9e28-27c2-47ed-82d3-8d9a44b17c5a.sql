
-- ===========================================
-- COMPETENCY-VERIFIED CPD ENGINE SCHEMA
-- ===========================================

-- Competency levels for multi-tier certification
CREATE TYPE public.competency_level AS ENUM (
  'knowledge_verified',
  'applied_competency',
  'professional_integration',
  'mastery'
);

-- Guided learning phase tracking per chapter
CREATE TABLE public.competency_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  
  -- Phase 1: Concept
  concept_completed BOOLEAN DEFAULT false,
  concept_completed_at TIMESTAMPTZ,
  
  -- Phase 2: Reflection
  reflection_submitted BOOLEAN DEFAULT false,
  reflection_text TEXT,
  reflection_quality_score NUMERIC,
  reflection_ai_feedback TEXT,
  reflection_submitted_at TIMESTAMPTZ,
  
  -- Phase 3: Application
  application_submitted BOOLEAN DEFAULT false,
  application_response TEXT,
  application_score NUMERIC,
  application_ai_evaluation JSONB DEFAULT '{}'::jsonb,
  application_submitted_at TIMESTAMPTZ,
  
  -- Phase 4: Competency Check
  competency_check_passed BOOLEAN DEFAULT false,
  competency_score NUMERIC,
  competency_responses JSONB DEFAULT '[]'::jsonb,
  competency_checked_at TIMESTAMPTZ,
  
  -- Overall
  current_phase TEXT DEFAULT 'concept' CHECK (current_phase IN ('concept', 'reflection', 'application', 'competency_check', 'completed')),
  overall_score NUMERIC,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, book_id, chapter_number)
);

ALTER TABLE public.competency_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own competency progress"
  ON public.competency_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Competency certificates (extends existing publishing_certificates concept)
CREATE TABLE public.competency_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  
  competency_level competency_level NOT NULL DEFAULT 'knowledge_verified',
  certificate_number TEXT NOT NULL UNIQUE,
  verification_hash TEXT,
  
  -- Skills and evidence
  skills_validated TEXT[] DEFAULT '{}',
  competency_summary TEXT,
  ai_evaluation_summary TEXT,
  
  -- Scores
  average_reflection_score NUMERIC,
  average_application_score NUMERIC,
  average_competency_score NUMERIC,
  overall_competency_score NUMERIC,
  
  -- Metadata
  chapters_completed INTEGER DEFAULT 0,
  total_chapters INTEGER DEFAULT 0,
  book_version_hash TEXT,
  
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competency_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own competency certificates"
  ON public.competency_certificates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Competency certificates are publicly verifiable"
  ON public.competency_certificates FOR SELECT
  USING (true);

-- Indexes for performance
CREATE INDEX idx_competency_progress_user_book ON public.competency_progress(user_id, book_id);
CREATE INDEX idx_competency_progress_phase ON public.competency_progress(current_phase);
CREATE INDEX idx_competency_certificates_number ON public.competency_certificates(certificate_number);
CREATE INDEX idx_competency_certificates_user ON public.competency_certificates(user_id);
CREATE INDEX idx_competency_certificates_level ON public.competency_certificates(competency_level);

-- Trigger for updated_at
CREATE TRIGGER update_competency_progress_updated_at
  BEFORE UPDATE ON public.competency_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competency_certificates_updated_at
  BEFORE UPDATE ON public.competency_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
