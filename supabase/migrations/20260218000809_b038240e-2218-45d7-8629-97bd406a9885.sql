
-- Chief Editor Audit results table
CREATE TABLE public.book_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Dimension scores (0-100)
  structural_score NUMERIC NOT NULL DEFAULT 0,
  academic_score NUMERIC NOT NULL DEFAULT 0,
  pedagogical_score NUMERIC NOT NULL DEFAULT 0,
  overall_score NUMERIC NOT NULL DEFAULT 0,
  
  -- Detailed results
  structural_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  academic_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  pedagogical_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Flagged sections: [{chapterNumber, section, issue, severity, suggestion}]
  flagged_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Per-chapter suggestions: [{chapterNumber, improvements: [string]}]
  chapter_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
  improvements_applied BOOLEAN NOT NULL DEFAULT false,
  improvements_applied_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.book_audits ENABLE ROW LEVEL SECURITY;

-- Users can view audits for their own books
CREATE POLICY "Users can view own book audits"
  ON public.book_audits FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create audits for their own books
CREATE POLICY "Users can create own book audits"
  ON public.book_audits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own audits
CREATE POLICY "Users can update own book audits"
  ON public.book_audits FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own audits
CREATE POLICY "Users can delete own book audits"
  ON public.book_audits FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_book_audits_updated_at
  BEFORE UPDATE ON public.book_audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_book_audits_book_id ON public.book_audits(book_id);
CREATE INDEX idx_book_audits_user_id ON public.book_audits(user_id);
