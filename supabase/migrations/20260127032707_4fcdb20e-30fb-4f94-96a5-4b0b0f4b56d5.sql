-- Create saved_learning_decks table for persisting generated learning decks
CREATE TABLE public.saved_learning_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deck_data JSONB NOT NULL DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'book',
  chapters_covered INTEGER[] DEFAULT '{}',
  target_audience TEXT DEFAULT 'student',
  tone TEXT DEFAULT 'academic',
  slide_count INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'basic',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_learning_decks ENABLE ROW LEVEL SECURITY;

-- Users can view their own saved decks
CREATE POLICY "Users can view their own saved decks"
ON public.saved_learning_decks
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own saved decks
CREATE POLICY "Users can create their own saved decks"
ON public.saved_learning_decks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own saved decks
CREATE POLICY "Users can update their own saved decks"
ON public.saved_learning_decks
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own saved decks
CREATE POLICY "Users can delete their own saved decks"
ON public.saved_learning_decks
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_saved_learning_decks_user_book ON public.saved_learning_decks(user_id, book_id);

-- Add trigger for updated_at
CREATE TRIGGER update_saved_learning_decks_updated_at
BEFORE UPDATE ON public.saved_learning_decks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();