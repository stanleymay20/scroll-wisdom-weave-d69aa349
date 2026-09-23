\set ON_ERROR_STOP on

\ir ../drizzle/migrations/0009_converge_publishing_identity_p4_attestation_authority.sql

DO $$
DECLARE
  v_user uuid := '92000000-0000-4000-8000-000000000001';
  v_book uuid;
  v_chapter uuid;
  v_hash_before text;
  v_hash_after text;
  v_ready boolean;
  v_count integer;
BEGIN
  -- Trust-boundary grants.
  IF has_function_privilege(
       'anon',
       'public.record_publication_gate_attestation_bound(uuid,uuid,text,text,text,jsonb,uuid,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.record_publication_gate_attestation_bound(uuid,uuid,text,text,text,jsonb,uuid,uuid)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'scope-bound attestation writer exposed to browser role';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.record_publication_gate_attestation_bound(uuid,uuid,text,text,text,jsonb,uuid,uuid)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role cannot execute scope-bound attestation writer';
  END IF;

  IF has_function_privilege(
       'service_role',
       'public.record_publication_gate_attestation(uuid,uuid,text,text,jsonb,uuid,uuid)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'legacy unbound attestation writer is still executable';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.compute_book_publication_hash(uuid)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.compute_book_publication_hash(uuid)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'publication hash exposed to browser role';
  END IF;

  INSERT INTO public.books(user_id, title, category, language)
  VALUES(v_user, 'Attestation Convergence Fixture', 'non_fiction', 'en')
  RETURNING id INTO v_book;

  INSERT INTO public.chapters(
    book_id,
    chapter_number,
    title,
    content,
    is_generated
  )
  VALUES(
    v_book,
    1,
    'One',
    'A deterministic generated chapter used to validate publication-scope binding.',
    true
  )
  RETURNING id INTO v_chapter;

  v_hash_before := public.compute_book_publication_hash(v_book);
  IF v_hash_before IS NULL OR v_hash_before !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid initial publication hash: %', v_hash_before;
  END IF;

  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'editorial', 'passed', v_hash_before,
    '{"fixture":"before-change"}'::jsonb, NULL, NULL
  );

  -- Mutating publication-bound content must invalidate an in-flight verdict.
  UPDATE public.books
  SET title = 'Attestation Convergence Fixture Changed'
  WHERE id = v_book;

  v_hash_after := public.compute_book_publication_hash(v_book);
  IF v_hash_after IS NOT DISTINCT FROM v_hash_before THEN
    RAISE EXCEPTION 'book title mutation failed to change publication hash';
  END IF;

  BEGIN
    PERFORM public.record_publication_gate_attestation_bound(
      v_book, v_user, 'structural', 'passed', v_hash_before,
      '{"fixture":"stale"}'::jsonb, NULL, NULL
    );
    RAISE EXCEPTION 'stale attestation unexpectedly recorded';
  EXCEPTION
    WHEN serialization_failure THEN
      NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.publication_gate_attestations
  WHERE book_id = v_book
    AND gate = 'structural';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stale bound attestation left a database row behind';
  END IF;

  -- Complete every required whole-book gate for the CURRENT scope.
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'editorial', 'passed', v_hash_after,
    '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'structural', 'passed', v_hash_after,
    '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'qa', 'passed', v_hash_after,
    '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'rights', 'passed', v_hash_after,
    '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'production', 'passed', v_hash_after,
    '{}'::jsonb, NULL, NULL
  );

  v_ready := public.has_current_publication_attestations(v_book);
  IF v_ready IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'complete current attestation set did not pass';
  END IF;

  -- Latest verdict wins for a matching scope/hash.
  PERFORM pg_catalog.pg_sleep(0.002);
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'qa', 'blocked', v_hash_after,
    '{"reason":"fixture-latest-block"}'::jsonb, NULL, NULL
  );

  v_ready := public.has_current_publication_attestations(v_book);
  IF v_ready IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'newer blocking QA attestation did not override earlier pass';
  END IF;

  PERFORM pg_catalog.pg_sleep(0.002);
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'qa', 'passed', v_hash_after,
    '{"reason":"fixture-repass"}'::jsonb, NULL, NULL
  );

  v_ready := public.has_current_publication_attestations(v_book);
  IF v_ready IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'newer passing QA attestation did not restore current readiness';
  END IF;
END
$$;

ROLLBACK;
