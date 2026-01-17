-- ============================================================
-- CONTRACT 6D — Assessment & Integrity Tracking Tables
-- Required for real certificate eligibility with NO placeholders
-- ============================================================

-- 1. Quiz attempts table - tracks all quiz submissions
CREATE TABLE public.quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  score NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  total_questions INTEGER NOT NULL DEFAULT 1,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Assessment integrity logs - tracks behavioral signals per session
CREATE TABLE public.assessment_integrity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  quiz_attempt_id UUID REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  
  -- Integrity scores (0.0 - 1.0 scale)
  integrity_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0 CHECK (integrity_score >= 0 AND integrity_score <= 1),
  typing_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0 CHECK (typing_score >= 0 AND typing_score <= 1),
  focus_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0 CHECK (focus_score >= 0 AND focus_score <= 1),
  timing_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0 CHECK (timing_score >= 0 AND timing_score <= 1),
  paste_score NUMERIC(4, 3) NOT NULL DEFAULT 1.0 CHECK (paste_score >= 0 AND paste_score <= 1),
  
  -- Behavioral signals
  paste_count INTEGER NOT NULL DEFAULT 0,
  focus_loss_count INTEGER NOT NULL DEFAULT 0,
  suspicious_timing BOOLEAN NOT NULL DEFAULT false,
  typing_variance NUMERIC(6, 2),
  
  -- Classification (from Contract 6B)
  severity TEXT NOT NULL DEFAULT 'trusted' CHECK (severity IN ('trusted', 'review', 'reject')),
  
  -- Metadata
  session_duration_ms INTEGER,
  device_fingerprint TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Mastery attempt tracking - for cooldown enforcement
CREATE TABLE public.mastery_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  attempted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  passed BOOLEAN NOT NULL DEFAULT false,
  score_at_attempt NUMERIC(5, 2),
  integrity_at_attempt NUMERIC(4, 3),
  reasons_failed TEXT[]
);

-- 4. Add verification_hash and revocation fields to publishing_certificates
ALTER TABLE public.publishing_certificates 
  ADD COLUMN IF NOT EXISTS verification_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS certificate_type TEXT DEFAULT 'completion' CHECK (certificate_type IN ('completion', 'mastery', 'publishing', 'authorship'));

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_integrity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mastery_attempts ENABLE ROW LEVEL SECURITY;

-- Quiz attempts: users can view/create their own
CREATE POLICY "Users can view their own quiz attempts"
  ON public.quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quiz attempts"
  ON public.quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Integrity logs: users can view their own (no insert from client - server only)
CREATE POLICY "Users can view their own integrity logs"
  ON public.assessment_integrity_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Allow server-side insert via service role (implicit when RLS is disabled for service role)
CREATE POLICY "Service can insert integrity logs"
  ON public.assessment_integrity_logs FOR INSERT
  WITH CHECK (true);

-- Mastery attempts: users can view their own
CREATE POLICY "Users can view their own mastery attempts"
  ON public.mastery_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can insert mastery attempts"
  ON public.mastery_attempts FOR INSERT
  WITH CHECK (true);

-- Publishing certificates: public read for verification, user insert only own
CREATE POLICY "Certificates are publicly viewable for verification"
  ON public.publishing_certificates FOR SELECT
  USING (true);

-- ============================================================
-- INDEXES for performance
-- ============================================================

CREATE INDEX idx_quiz_attempts_user_book ON public.quiz_attempts(user_id, book_id);
CREATE INDEX idx_quiz_attempts_chapter ON public.quiz_attempts(chapter_id);
CREATE INDEX idx_integrity_logs_user_book ON public.assessment_integrity_logs(user_id, book_id);
CREATE INDEX idx_integrity_logs_severity ON public.assessment_integrity_logs(severity);
CREATE INDEX idx_mastery_attempts_user_book ON public.mastery_attempts(user_id, book_id);
CREATE INDEX idx_publishing_certificates_number ON public.publishing_certificates(certificate_number);
CREATE INDEX idx_publishing_certificates_hash ON public.publishing_certificates(verification_hash);