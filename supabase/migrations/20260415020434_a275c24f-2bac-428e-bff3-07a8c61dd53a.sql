
-- Create generation_jobs table for tracking book generation progress
CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'partial')),
  current_chapter integer NOT NULL DEFAULT 0,
  total_chapters integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own generation jobs"
  ON public.generation_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own generation jobs"
  ON public.generation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update own generation jobs"
  ON public.generation_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all jobs
CREATE POLICY "Admins can view all generation jobs"
  ON public.generation_jobs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Index for fast lookup
CREATE INDEX idx_generation_jobs_user_book ON public.generation_jobs (user_id, book_id);
CREATE INDEX idx_generation_jobs_status ON public.generation_jobs (status) WHERE status IN ('pending', 'generating');

-- Auto-update timestamp
CREATE TRIGGER update_generation_jobs_updated_at
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
