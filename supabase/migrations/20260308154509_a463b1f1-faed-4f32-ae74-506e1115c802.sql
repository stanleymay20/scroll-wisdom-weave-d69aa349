
-- CRITICAL SECURITY FIX: Prevent privilege escalation via profiles.role

-- 1. Trigger to prevent users from changing their own role column
CREATE OR REPLACE FUNCTION public.prevent_role_self_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_protection ON public.profiles;
CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_assignment();

-- 2. Replace RLS policies that use profiles.role with has_role()

DROP POLICY IF EXISTS "Admins can view all integrity logs" ON public.assessment_integrity_logs;
CREATE POLICY "Admins can view all integrity logs"
  ON public.assessment_integrity_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all study notes" ON public.study_notes;
CREATE POLICY "Admins can view all study notes"
  ON public.study_notes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'moderator')
  );
