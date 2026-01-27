-- Create reading_sessions table to track time spent reading
CREATE TABLE public.reading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reading_goals table for weekly targets
CREATE TABLE public.reading_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  weekly_minutes_goal INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_goals ENABLE ROW LEVEL SECURITY;

-- RLS policies for reading_sessions
CREATE POLICY "Users can view their own reading sessions"
ON public.reading_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reading sessions"
ON public.reading_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading sessions"
ON public.reading_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for reading_goals
CREATE POLICY "Users can view their own reading goals"
ON public.reading_goals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reading goals"
ON public.reading_goals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading goals"
ON public.reading_goals FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_reading_sessions_user_week ON public.reading_sessions(user_id, started_at);