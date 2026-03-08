
-- Fix: Restrict assessment_integrity_logs INSERT to service role only
-- Drop the permissive INSERT policy that lets any user fabricate integrity records
DROP POLICY IF EXISTS "System can create logs" ON public.assessment_integrity_logs;

-- Create a SECURITY DEFINER function for inserting integrity logs (only callable from edge functions)
CREATE OR REPLACE FUNCTION public.insert_integrity_log(
  _user_id uuid,
  _book_id uuid DEFAULT NULL,
  _chapter_id uuid DEFAULT NULL,
  _violation_type text DEFAULT NULL,
  _integrity_score numeric DEFAULT 100,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.assessment_integrity_logs (user_id, book_id, chapter_id, violation_type, integrity_score, details)
  VALUES (_user_id, _book_id, _chapter_id, _violation_type, _integrity_score, _details)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
