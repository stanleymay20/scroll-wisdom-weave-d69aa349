
-- ============================================================
-- MASTERY TRACKING ENGINE — Database Schema
-- ============================================================

-- 1. Learning Progress: Per-chapter, per-attempt Bloom-level tracking
CREATE TABLE public.learning_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  bloom_level TEXT NOT NULL DEFAULT 'remember'
    CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
  score NUMERIC NOT NULL DEFAULT 0,
  question_difficulty INTEGER NOT NULL DEFAULT 1 CHECK (question_difficulty BETWEEN 1 AND 6),
  improvement_delta NUMERIC DEFAULT 0,
  mastery_status TEXT NOT NULL DEFAULT 'developing'
    CHECK (mastery_status IN ('developing', 'proficient', 'mastery')),
  remediation_triggered BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint for attempt tracking
CREATE UNIQUE INDEX idx_learning_progress_attempt 
  ON public.learning_progress(user_id, book_id, chapter_id, attempt_number);

-- Index for user queries
CREATE INDEX idx_learning_progress_user_book 
  ON public.learning_progress(user_id, book_id);

-- Enable RLS
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own learning progress"
  ON public.learning_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Competency Profile: Aggregated domain-level Bloom scores
CREATE TABLE public.competency_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT NOT NULL DEFAULT 'general',
  remember_score NUMERIC DEFAULT 0,
  understand_score NUMERIC DEFAULT 0,
  apply_score NUMERIC DEFAULT 0,
  analyze_score NUMERIC DEFAULT 0,
  evaluate_score NUMERIC DEFAULT 0,
  create_score NUMERIC DEFAULT 0,
  growth_trend TEXT NOT NULL DEFAULT 'improving'
    CHECK (growth_trend IN ('improving', 'plateau', 'declining')),
  total_attempts INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain)
);

-- Enable RLS
ALTER TABLE public.competency_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own competency profile"
  ON public.competency_profile FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Add mastery fields to competency_certificates
ALTER TABLE public.competency_certificates 
  ADD COLUMN IF NOT EXISTS bloom_distribution JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS improvement_trend TEXT DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mastery_classification TEXT DEFAULT 'proficient',
  ADD COLUMN IF NOT EXISTS domain_snapshot JSONB DEFAULT '{}';
