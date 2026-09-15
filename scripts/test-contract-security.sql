-- Fail-closed invariants for ScrollLibrary governance contracts.

DO $$
BEGIN
  -- Browser roles may read their own evidence through RLS, but may not mint it.
  IF has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6C: authenticated may mint quiz_attempt evidence';
  END IF;
  IF has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6B: authenticated may mint integrity evidence';
  END IF;
  IF has_table_privilege('authenticated', 'public.mastery_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6C: authenticated may mint mastery evidence';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Contract 6B: authenticated may call integrity writer';
  END IF;

  -- Service authority must remain available for issuance/erasure paths.
  IF NOT has_table_privilege('service_role', 'public.quiz_attempts', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.assessment_integrity_logs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.mastery_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Credential server authority is incomplete';
  END IF;

  -- Contract 12 snapshot columns are mandatory once this migration set is applied.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publishing_certificates' AND column_name='book_content_hash'
  ) THEN
    RAISE EXCEPTION 'Contract 12: publishing_certificates.book_content_hash missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publishing_certificates' AND column_name='assessment_contract_passed'
  ) THEN
    RAISE EXCEPTION 'Contract 8: assessment_contract_passed missing';
  END IF;
END
$$;
