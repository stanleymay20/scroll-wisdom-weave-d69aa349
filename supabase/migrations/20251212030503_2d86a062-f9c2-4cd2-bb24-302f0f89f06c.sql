-- Add launch mode tracking fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_book_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_book_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tts_minutes_used INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tts_month TEXT;

-- Create TTS usage tracking table
CREATE TABLE IF NOT EXISTS public.tts_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month TEXT NOT NULL,
  minutes_used INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Enable RLS on tts_usage
ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for tts_usage
CREATE POLICY "Users can view their own TTS usage" 
ON public.tts_usage 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own TTS usage" 
ON public.tts_usage 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own TTS usage" 
ON public.tts_usage 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add student plan to user_plan enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'student' AND enumtypid = 'user_plan'::regtype) THEN
    ALTER TYPE user_plan ADD VALUE 'student';
  END IF;
END $$;