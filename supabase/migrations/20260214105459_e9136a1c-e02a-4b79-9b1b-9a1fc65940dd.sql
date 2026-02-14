-- PMF Validation Metrics Table
CREATE TABLE public.pmf_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- 'book_generated', 'chapter_completed', 'quiz_completed', 'certificate_issued', 'second_book', 'upgrade_clicked', 'paid_conversion'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pmf_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can create own events"
ON public.pmf_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view own events
CREATE POLICY "Users can view own events"
ON public.pmf_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all events
CREATE POLICY "Admins can view all events"
ON public.pmf_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Index for fast queries
CREATE INDEX idx_pmf_events_type ON public.pmf_events (event_type);
CREATE INDEX idx_pmf_events_created ON public.pmf_events (created_at DESC);
CREATE INDEX idx_pmf_events_user ON public.pmf_events (user_id);
