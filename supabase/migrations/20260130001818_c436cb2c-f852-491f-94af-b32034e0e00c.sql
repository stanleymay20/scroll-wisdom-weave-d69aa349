-- Add missing columns to chapters table
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS is_generated BOOLEAN DEFAULT false;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS academic_mode BOOLEAN DEFAULT false;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS citation_style TEXT DEFAULT 'apa';
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS chapter_references JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS research_metadata JSONB DEFAULT '{}'::jsonb;

-- Create reading_sessions table
CREATE TABLE IF NOT EXISTS public.reading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_number INTEGER,
  duration_seconds INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own reading sessions" ON public.reading_sessions FOR ALL USING (auth.uid() = user_id);

-- Create reading_goals table
CREATE TABLE IF NOT EXISTS public.reading_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  weekly_minutes_goal INTEGER DEFAULT 60,
  daily_pages_goal INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own reading goals" ON public.reading_goals FOR ALL USING (auth.uid() = user_id);

-- Fix the subscriptions policy that has USING (true)
DROP POLICY IF EXISTS "Service can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Users can manage own subscription" ON public.subscriptions FOR ALL USING (auth.uid() = user_id);

-- Fix tts_usage policy
DROP POLICY IF EXISTS "Users can update own tts usage" ON public.tts_usage;

-- Add trigger for reading_goals
CREATE TRIGGER update_reading_goals_updated_at 
  BEFORE UPDATE ON public.reading_goals 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();