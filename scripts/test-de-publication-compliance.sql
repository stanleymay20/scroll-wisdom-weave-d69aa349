-- Germany publication-compliance V1 schema/security assertions.
-- Intended for fresh-schema CI and controlled staging verification.

DO $$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('public.publication_compliance_declarations') IS NULL THEN
    RAISE EXCEPTION 'publication_compliance_declarations missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.publication_compliance_declarations'::regclass
    AND attname IN (
      'book_id',
      'owner_user_id',
      'jurisdiction',
      'product_form',
      'language',
      'edition_label',
      'german_market_intended',
      'commercial_release',
      'publisher_state_code',
      'publisher_operating_basis_confirmed',
      'imprint_notice_confirmed',
      'dnb_deposit_plan_confirmed',
      'state_deposit_plan_confirmed',
      'dnb_deposit_completed_at',
      'state_deposit_completed_at',
      'deposit_evidence_reference',
      'direct_sales_enabled',
      'direct_sales_legal_notice_confirmed',
      'packaging_responsibility',
      'lucid_status',
      'acknowledged_at'
    )
    AND NOT attisdropped;
  IF v_count <> 21 THEN
    RAISE EXCEPTION 'publication compliance column contract incomplete: %/21', v_count;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.publication_compliance_declarations'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on publication_compliance_declarations';
  END IF;

  IF has_table_privilege('anon', 'public.publication_compliance_declarations', 'SELECT')
     OR has_table_privilege('anon', 'public.publication_compliance_declarations', 'INSERT')
     OR has_table_privilege('anon', 'public.publication_compliance_declarations', 'UPDATE')
     OR has_table_privilege('anon', 'public.publication_compliance_declarations', 'DELETE') THEN
    RAISE EXCEPTION 'anon must have no publication-compliance privileges';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.publication_compliance_declarations', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must retain owner-filtered SELECT through RLS';
  END IF;

  IF has_table_privilege('authenticated', 'public.publication_compliance_declarations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.publication_compliance_declarations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.publication_compliance_declarations', 'DELETE') THEN
    RAISE EXCEPTION 'browser roles must not write compliance declarations directly';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.publication_compliance_declarations', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.publication_compliance_declarations', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.publication_compliance_declarations', 'DELETE') THEN
    RAISE EXCEPTION 'service_role must own server-side compliance writes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.publication_compliance_declarations'::regclass
      AND conname = 'publication_compliance_identity_uq'
  ) THEN
    RAISE EXCEPTION 'publication compliance identity uniqueness constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.publication_compliance_declarations'::regclass
      AND conname = 'publication_compliance_lucid_shape'
  ) THEN
    RAISE EXCEPTION 'LUCID responsibility shape constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.publication_compliance_declarations'::regclass
      AND conname = 'publication_compliance_direct_sales_shape'
  ) THEN
    RAISE EXCEPTION 'direct-sales declaration shape constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'publication_compliance_declarations'
      AND policyname = 'publication_compliance_owner_read'
  ) THEN
    RAISE EXCEPTION 'owner-read RLS policy missing';
  END IF;
END $$;

SELECT 'DE_PUBLICATION_COMPLIANCE_SCHEMA_OK' AS result;
