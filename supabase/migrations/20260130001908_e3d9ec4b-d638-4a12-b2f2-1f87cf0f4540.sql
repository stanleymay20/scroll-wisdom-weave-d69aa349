-- Rename month_year to month in tts_usage table
ALTER TABLE public.tts_usage RENAME COLUMN month_year TO month;

-- Add notes column to moderation_queue
ALTER TABLE public.moderation_queue ADD COLUMN IF NOT EXISTS notes TEXT;

-- Fix study_notes table to have user_id column properly named
ALTER TABLE public.study_notes ADD COLUMN IF NOT EXISTS user_id_new UUID REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.study_notes SET user_id_new = user_id WHERE user_id_new IS NULL;

-- Fix the contact submissions policy
DROP POLICY IF EXISTS "Users can create contact submissions" ON public.contact_submissions;
CREATE POLICY "Anyone can create contact submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);