-- Add missing columns to publishing_certificates
ALTER TABLE public.publishing_certificates ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
ALTER TABLE public.publishing_certificates ADD COLUMN IF NOT EXISTS verification_hash TEXT;

-- Add missing columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- Create contact_submissions table
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create contact submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own submissions" ON public.contact_submissions FOR SELECT USING (auth.uid() = user_id);

-- Create moderation_queue table
CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  flagged_reason TEXT,
  severity TEXT DEFAULT 'low',
  status TEXT DEFAULT 'pending',
  moderator_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Moderators can view queue" ON public.moderation_queue FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
);
CREATE POLICY "Moderators can manage queue" ON public.moderation_queue FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
);

-- Add missing columns to content_reports
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'book';
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS content_id UUID;

-- Add missing columns to saved_learning_decks
ALTER TABLE public.saved_learning_decks ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE public.saved_learning_decks ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE public.saved_learning_decks ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';