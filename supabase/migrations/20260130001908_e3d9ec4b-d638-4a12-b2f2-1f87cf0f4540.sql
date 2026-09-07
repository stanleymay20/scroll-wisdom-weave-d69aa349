-- Historical compatibility migration. Earlier schemas may already use `month`
-- instead of `month_year`, so rename only when the legacy column actually exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tts_usage' AND column_name = 'month_year'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tts_usage' AND column_name = 'month'
  ) THEN
    ALTER TABLE public.tts_usage RENAME COLUMN month_year TO month;
  END IF;
END
$$;

ALTER TABLE public.moderation_queue ADD COLUMN IF NOT EXISTS notes TEXT;

-- Preserve the existing user_id authority column while retaining this
-- migration's compatibility alias for code from the January snapshot.
ALTER TABLE public.study_notes
  ADD COLUMN IF NOT EXISTS user_id_new UUID REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.study_notes SET user_id_new = user_id WHERE user_id_new IS NULL;

DROP POLICY IF EXISTS "Users can create contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Anyone can create contact submissions" ON public.contact_submissions;
CREATE POLICY "Anyone can create contact submissions"
  ON public.contact_submissions FOR INSERT WITH CHECK (true);