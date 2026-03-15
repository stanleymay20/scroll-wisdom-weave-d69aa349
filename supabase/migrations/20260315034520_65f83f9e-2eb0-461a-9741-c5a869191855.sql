
-- Quiz question history for anti-repetition tracking
CREATE TABLE public.quiz_question_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  concept_pair_key text NOT NULL,
  source_concept_ids text[] NOT NULL DEFAULT '{}',
  source_chapters integer[] NOT NULL DEFAULT '{}',
  question_type text NOT NULL,
  bloom_level text NOT NULL,
  relationship_types text[] NOT NULL DEFAULT '{}',
  is_graph_driven boolean NOT NULL DEFAULT false,
  question_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_quiz_history_user_book ON public.quiz_question_history(user_id, book_id, created_at DESC);
CREATE INDEX idx_quiz_history_pair ON public.quiz_question_history(user_id, book_id, concept_pair_key);

-- RLS
ALTER TABLE public.quiz_question_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quiz history"
  ON public.quiz_question_history
  FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
