
-- Fix: Drop the policy on security_audit_log only if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.security_audit_log';
  END IF;
  
  -- Enable RLS on public_books if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_books') THEN
    EXECUTE 'ALTER TABLE public.public_books ENABLE ROW LEVEL SECURITY';
    BEGIN
      EXECUTE 'CREATE POLICY "Only published books visible" ON public.public_books FOR SELECT USING (is_published = true)';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
