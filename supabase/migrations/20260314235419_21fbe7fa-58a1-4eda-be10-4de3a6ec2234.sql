
-- Concept nodes: persistent book-level concepts
CREATE TABLE public.concept_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  label text NOT NULL,
  normalized_label text NOT NULL,
  definition text,
  chapter_first_seen integer NOT NULL DEFAULT 1,
  chapters_referenced integer[] NOT NULL DEFAULT '{}',
  examples text[] NOT NULL DEFAULT '{}',
  applications text[] NOT NULL DEFAULT '{}',
  difficulty integer NOT NULL DEFAULT 3,
  importance integer NOT NULL DEFAULT 3,
  citation_refs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, normalized_label)
);

-- Concept edges: typed relationships between concepts
CREATE TABLE public.concept_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.concept_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.concept_nodes(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'depends_on',
  chapter_introduced integer,
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, source_node_id, target_node_id, relationship_type)
);

-- Learner concept state: per-user mastery overlay
CREATE TABLE public.learner_concept_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  concept_node_id uuid NOT NULL REFERENCES public.concept_nodes(id) ON DELETE CASCADE,
  familiarity_score numeric NOT NULL DEFAULT 0,
  mastery_score numeric NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  last_assessed_at timestamptz,
  misconception_flags text[] NOT NULL DEFAULT '{}',
  application_confidence numeric NOT NULL DEFAULT 0,
  times_reviewed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, concept_node_id)
);

-- Book graph metadata
CREATE TABLE public.book_knowledge_graphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE UNIQUE,
  total_nodes integer NOT NULL DEFAULT 0,
  total_edges integer NOT NULL DEFAULT 0,
  chapters_indexed integer[] NOT NULL DEFAULT '{}',
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  mermaid_graph text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.concept_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_concept_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_knowledge_graphs ENABLE ROW LEVEL SECURITY;

-- concept_nodes: readable if book is accessible, manageable by book owner
CREATE POLICY "Concept nodes viewable if book accessible" ON public.concept_nodes
FOR SELECT USING (
  EXISTS (SELECT 1 FROM books WHERE books.id = concept_nodes.book_id AND (books.is_published = true OR books.user_id = auth.uid()))
);

CREATE POLICY "Book owners can manage concept nodes" ON public.concept_nodes
FOR ALL USING (
  EXISTS (SELECT 1 FROM books WHERE books.id = concept_nodes.book_id AND books.user_id = auth.uid())
);

-- concept_edges: same pattern
CREATE POLICY "Concept edges viewable if book accessible" ON public.concept_edges
FOR SELECT USING (
  EXISTS (SELECT 1 FROM books b WHERE b.id = concept_edges.book_id AND (b.is_published = true OR b.user_id = auth.uid()))
);

CREATE POLICY "Book owners can manage concept edges" ON public.concept_edges
FOR ALL USING (
  EXISTS (SELECT 1 FROM books b WHERE b.id = concept_edges.book_id AND b.user_id = auth.uid())
);

-- learner_concept_states: user owns their own
CREATE POLICY "Users can manage own concept states" ON public.learner_concept_states
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- book_knowledge_graphs: readable if book accessible, manageable by owner
CREATE POLICY "Book graphs viewable if book accessible" ON public.book_knowledge_graphs
FOR SELECT USING (
  EXISTS (SELECT 1 FROM books b WHERE b.id = book_knowledge_graphs.book_id AND (b.is_published = true OR b.user_id = auth.uid()))
);

CREATE POLICY "Book owners can manage book graphs" ON public.book_knowledge_graphs
FOR ALL USING (
  EXISTS (SELECT 1 FROM books b WHERE b.id = book_knowledge_graphs.book_id AND b.user_id = auth.uid())
);
