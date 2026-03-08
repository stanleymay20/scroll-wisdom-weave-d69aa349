
-- Book collaborators table
CREATE TABLE public.book_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer', 'commenter')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(book_id, user_id)
);

-- Enable RLS
ALTER TABLE public.book_collaborators ENABLE ROW LEVEL SECURITY;

-- Owner can manage collaborators
CREATE POLICY "Book owners can manage collaborators"
ON public.book_collaborators
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
);

-- Collaborators can read their own invites
CREATE POLICY "Users can view own collaborations"
ON public.book_collaborators
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR invited_by = auth.uid());

-- Collaborators can update their own status (accept/decline)
CREATE POLICY "Users can update own invite status"
ON public.book_collaborators
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Chapter edit sessions for presence tracking
CREATE TABLE public.chapter_edit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  user_name text,
  user_avatar text,
  is_active boolean NOT NULL DEFAULT true,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chapter_edit_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone involved with the book can see sessions
CREATE POLICY "Collaborators can view edit sessions"
ON public.chapter_edit_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.books WHERE id = book_id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.book_collaborators WHERE book_id = chapter_edit_sessions.book_id AND user_id = auth.uid() AND status = 'accepted')
);

-- Users can manage their own sessions
CREATE POLICY "Users can manage own sessions"
ON public.chapter_edit_sessions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.book_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chapter_edit_sessions;

-- Allow collaborators to read chapters of shared books
CREATE POLICY "Collaborators can read shared book chapters"
ON public.chapters
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.book_collaborators bc
    WHERE bc.book_id = chapters.book_id
    AND bc.user_id = auth.uid()
    AND bc.status = 'accepted'
  )
);

-- Allow editor collaborators to update chapters
CREATE POLICY "Editor collaborators can update chapters"
ON public.chapters
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.book_collaborators bc
    WHERE bc.book_id = chapters.book_id
    AND bc.user_id = auth.uid()
    AND bc.status = 'accepted'
    AND bc.role = 'editor'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.book_collaborators bc
    WHERE bc.book_id = chapters.book_id
    AND bc.user_id = auth.uid()
    AND bc.status = 'accepted'
    AND bc.role = 'editor'
  )
);
