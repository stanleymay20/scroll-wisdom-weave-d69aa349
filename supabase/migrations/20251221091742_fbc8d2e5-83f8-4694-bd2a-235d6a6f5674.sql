-- Create the update_updated_at_column function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create study_notes table for saving Q&A conversations and quiz results
CREATE TABLE public.study_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'qa_conversation',
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  highlighted_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own study notes" 
ON public.study_notes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own study notes" 
ON public.study_notes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own study notes" 
ON public.study_notes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own study notes" 
ON public.study_notes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_study_notes_user_id ON public.study_notes(user_id);
CREATE INDEX idx_study_notes_book_id ON public.study_notes(book_id);
CREATE INDEX idx_study_notes_chapter_id ON public.study_notes(chapter_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_study_notes_updated_at
BEFORE UPDATE ON public.study_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();