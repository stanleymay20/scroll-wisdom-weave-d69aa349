
-- Spaced Repetition Cards table
CREATE TABLE public.spaced_repetition_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  bloom_level TEXT NOT NULL DEFAULT 'remember',
  -- SM-2 algorithm fields
  ease_factor NUMERIC NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  -- Performance tracking
  total_reviews INTEGER NOT NULL DEFAULT 0,
  correct_reviews INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.spaced_repetition_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own SRS cards"
  ON public.spaced_repetition_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_srs_cards_user_next_review 
  ON public.spaced_repetition_cards(user_id, next_review_at);

CREATE INDEX idx_srs_cards_book 
  ON public.spaced_repetition_cards(user_id, book_id);

CREATE TRIGGER update_srs_cards_updated_at
  BEFORE UPDATE ON public.spaced_repetition_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
