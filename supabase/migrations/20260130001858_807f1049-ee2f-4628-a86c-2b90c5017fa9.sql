-- Historical compatibility migration. Make additions and policies replay-safe
-- because contact/moderation objects already exist in earlier migrations.

ALTER TABLE public.publishing_certificates
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS verification_hash TEXT;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- contact_submissions
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
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can create contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON public.contact_submissions;
CREATE POLICY "Users can create contact submissions"
  ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own submissions"
  ON public.contact_submissions FOR SELECT USING (auth.uid() = user_id);

-- moderation_queue predates this migration with the moderation workflow fields.
-- Preserve that schema and add the later book/chapter resolution links.
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
ALTER TABLE public.moderation_queue
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Moderators can view queue" ON public.moderation_queue;
DROP POLICY IF EXISTS "Moderators can manage queue" ON public.moderation_queue;
CREATE POLICY "Moderators can view queue" ON public.moderation_queue FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);
CREATE POLICY "Moderators can manage queue" ON public.moderation_queue FOR ALL USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
) WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'book',
  ADD COLUMN IF NOT EXISTS content_id UUID;

ALTER TABLE public.saved_learning_decks
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS tone TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';