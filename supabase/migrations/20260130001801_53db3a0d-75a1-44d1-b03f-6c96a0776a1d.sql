-- Add missing columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'system';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 16;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reader_theme TEXT DEFAULT 'sepia';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS animations_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_updates BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS new_book_alerts BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS course_reminders BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS writing_tone TEXT DEFAULT 'balanced';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS spiritual_strictness TEXT DEFAULT 'moderate';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS complexity_level TEXT DEFAULT 'intermediate';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS study_speed TEXT DEFAULT 'normal';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_voice_preference TEXT DEFAULT 'default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS learning_preferences JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_book_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_book_date DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- Add missing columns to books table
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS author_ai_agent TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES auth.users(id);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Add missing columns to chapters table
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;

-- Create study_notes table
CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  note_type TEXT DEFAULT 'note',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own study notes" ON public.study_notes FOR ALL USING (auth.uid() = user_id);

-- Create tts_usage table
CREATE TABLE IF NOT EXISTS public.tts_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  minutes_used NUMERIC DEFAULT 0,
  month_year TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, month_year)
);

ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tts usage" ON public.tts_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own tts usage" ON public.tts_usage FOR ALL USING (auth.uid() = user_id);

-- Update books creator_id to match user_id for existing books
UPDATE public.books SET creator_id = user_id WHERE creator_id IS NULL;