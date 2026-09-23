\set ON_ERROR_STOP on

\ir ../drizzle/migrations/0012_converge_atomic_publication_mint.sql
\ir ../drizzle/migrations/0013_converge_certified_publication_manuscript_integrity.sql

BEGIN;

DO $$
DECLARE
  v_user uuid := '94000000-0000-4000-8000-000000000001';
  v_holder uuid;
  v_work uuid;
  v_book uuid;
  v_chapter uuid;
  v_scope_hash text;
  v_hash_before_design text;
  v_design jsonb;
  v_scroll_work_id text;
  v_scroll_edition_id text := 'SLE-ATOMIC-MINT-FIXTURE-0001';
  v_snapshot jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_publication uuid;
  v_status text;
  v_certificate uuid;
  v_count integer;
  v_work_current uuid;
  v_book_current uuid;
BEGIN
  IF has_function_privilege(
       'anon',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'mint_verified_publication_release ACL is wrong';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'atomic-mint@example.test',
    'x',
    now(), now(), now(),
    '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO public.rights_holders(
    holder_type, user_id, display_name, verified
  )
  VALUES(
    'individual'::public.rights_holder_type,
    v_user,
    'Atomic Mint Author',
    false
  )
  RETURNING id INTO v_holder;

  INSERT INTO public.works(
    title,
    original_language,
    owner_rights_holder_id,
    created_by
  )
  VALUES(
    'Atomic Mint Work',
    'en',
    v_holder,
    v_user
  )
  RETURNING id, scroll_work_id INTO v_work, v_scroll_work_id;

  INSERT INTO public.books(
    user_id,
    title,
    description,
    category,
    language,
    work_id,
    author_mode,
    author_display_name
  )
  VALUES(
    v_user,
    'Atomic Mint Book',
    'A controlled fixture for verified publication minting.',
    'non_fiction',
    'en',
    v_work,
    'user_name',
    'Atomic Mint Author'
  )
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
    'This generated chapter is long enough to represent a persisted publication scope for the atomic mint lifecycle.',
    true
  )
  RETURNING id INTO v_chapter;

  INSERT INTO public.book_publishing_profiles(
    book_id,
    owner_user_id,
    imprint_id,
    publisher_mode,
    edition_label,
    publication_language,
    print_identifier_strategy,
    ebook_identifier_strategy,
    distribution_scope
  )
  VALUES(
    v_book,
    v_user,
    NULL,
    'kdp_independent',
    'First edition',
    'en',
    'kdp_free',
    'unassigned',
    'kdp_only'
  );

  -- Design is part of the certified publication state. A layout/design change
  -- must invalidate earlier production attestations just like manuscript text.
  v_hash_before_design := public.compute_book_publication_hash(v_book);

  UPDATE public.books
  SET design_settings = COALESCE(design_settings, '{}'::jsonb)
    || '{"accent_color":"#123456","fixture_design":"atomic-mint"}'::jsonb
  WHERE id = v_book;

  SELECT design_settings INTO STRICT v_design
  FROM public.books
  WHERE id = v_book;

  v_scope_hash := public.compute_book_publication_hash(v_book);
  IF v_scope_hash IS NULL OR v_scope_hash !~ '^[0-9a-f]{64}
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'editorial', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'structural', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'qa', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'rights', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'production', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );

  IF public.has_current_publication_attestations(v_book) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fixture does not satisfy current publication gates';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'scroll_work_id', v_scroll_work_id,
    'scroll_edition_id', v_scroll_edition_id,
    'frozen_at', '2026-09-23T04:00:00Z',
    'title', 'Atomic Mint Book',
    'language', 'en',
    'edition', 'First edition',
    'print_identifier_strategy', 'kdp_free',
    'ebook_identifier_strategy', 'unassigned',
    'distribution_scope', 'kdp_only',
    'publisher', pg_catalog.jsonb_build_object(
      'mode', 'kdp_independent',
      'verification', 'kdp_free_isbn_at_submission'
    ),
    'identifiers', '[]'::jsonb,
    'isbn_by_format', '{}'::jsonb,
    'authors', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'display_name', 'Atomic Mint Author',
        'sort_order', 0
      )
    ),
    'rights_holders', '[]'::jsonb,
    'rights', '[]'::jsonb,
    'citations', '[]'::jsonb,
    'chapters', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'chapter_number', 1,
        'title', 'One'
      )
    ),
    'design', v_design,
    'publication_trust', pg_catalog.jsonb_build_object(
      'scope_hash', v_scope_hash
    )
  );

  -- The mint itself rechecks the authoritative scope inside its transaction.
  -- A content change after review must reject the stale frozen scope and leave
  -- no Publication row behind.
  UPDATE public.books
  SET title = 'Atomic Mint Book Changed After Review'
  WHERE id = v_book;

  BEGIN
    PERFORM public.mint_verified_publication_release(
      v_user,
      v_work,
      v_book,
      'SLE-ATOMIC-MINT-FIXTURE-STALE',
      'original'::public.publication_edition_kind,
      'en',
      pg_catalog.jsonb_set(
        v_snapshot,
        '{scroll_edition_id}',
        '"SLE-ATOMIC-MINT-FIXTURE-STALE"'::jsonb
      ),
      v_design,
      repeat('d', 64),
      'stale scope fixture'
    );
    RAISE EXCEPTION 'stale scope unexpectedly minted';
  EXCEPTION
    WHEN serialization_failure THEN
      NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.publications
  WHERE work_id = v_work;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stale scope attempt created a publication: %', v_count;
  END IF;

  -- Restore the exact reviewed manuscript before the real mint. Because title
  -- is part of the scope hash, the original attestations become current again.
  UPDATE public.books
  SET title = 'Atomic Mint Book'
  WHERE id = v_book;

  IF public.compute_book_publication_hash(v_book) IS DISTINCT FROM v_scope_hash THEN
    RAISE EXCEPTION 'restored reviewed manuscript did not restore scope hash';
  END IF;

  v_result := public.mint_verified_publication_release(
    v_user,
    v_work,
    v_book,
    v_scroll_edition_id,
    'original'::public.publication_edition_kind,
    'en',
    v_snapshot,
    v_design,
    repeat('c', 64),
    'atomic mint fixture'
  );

  v_publication := (v_result->>'publication_id')::uuid;
  IF v_publication IS NULL THEN
    RAISE EXCEPTION 'mint did not return a publication id: %', v_result;
  END IF;

  SELECT status::text, certificate_id
  INTO STRICT v_status, v_certificate
  FROM public.publications
  WHERE id = v_publication;

  IF v_status <> 'published' OR v_certificate IS NULL THEN
    RAISE EXCEPTION 'mint did not atomically publish/certify: status=% cert=%',
      v_status, v_certificate;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publication_certificates
  WHERE publication_id = v_publication
    AND content_hash = repeat('c', 64);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'publication certificate missing or duplicated: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publication_products
  WHERE publication_id = v_publication
    AND product_form = 'paperback';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KDP-free publication product was not materialized exactly once: %', v_count;
  END IF;

  SELECT current_publication_id INTO STRICT v_work_current
  FROM public.works WHERE id = v_work;
  SELECT current_publication_id INTO STRICT v_book_current
  FROM public.books WHERE id = v_book;
  IF v_work_current IS DISTINCT FROM v_publication
     OR v_book_current IS DISTINCT FROM v_publication THEN
    RAISE EXCEPTION 'current publication pointers were not atomically advanced';
  END IF;

  -- Same frozen state with only volatile SLE/frozen_at differences is the same
  -- release request and must return the already-minted publication.
  v_retry := public.mint_verified_publication_release(
    v_user,
    v_work,
    v_book,
    'SLE-ATOMIC-MINT-FIXTURE-RETRY',
    'original'::public.publication_edition_kind,
    'en',
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_snapshot,
        '{scroll_edition_id}',
        '"SLE-ATOMIC-MINT-FIXTURE-RETRY"'::jsonb
      ),
      '{frozen_at}',
      '"2026-09-23T04:01:00Z"'::jsonb
    ),
    v_design,
    repeat('c', 64),
    'atomic mint fixture retry'
  );

  IF (v_retry->>'publication_id')::uuid IS DISTINCT FROM v_publication
     OR COALESCE((v_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'same-state mint retry was not idempotent: %', v_retry;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publications
  WHERE work_id = v_work;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'idempotent retry created a second publication: %', v_count;
  END IF;

  -- Published identity is immutable.
  BEGIN
    UPDATE public.publications
    SET snapshot = snapshot || '{"tampered":true}'::jsonb
    WHERE id = v_publication;
    RAISE EXCEPTION 'published snapshot mutation unexpectedly succeeded';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      NULL;
  END;

  -- The certified live manuscript consumed by readers cannot drift away from
  -- the immutable Publication that now points at it.
  BEGIN
    UPDATE public.books
    SET title = 'Illegal Certified Title Mutation'
    WHERE id = v_book;
    RAISE EXCEPTION 'certified book title mutation unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.books
    SET design_settings = design_settings || '{"accent_color":"#abcdef"}'::jsonb
    WHERE id = v_book;
    RAISE EXCEPTION 'certified design mutation unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.chapters
    SET content = content || ' illegal certified drift'
    WHERE id = v_chapter;
    RAISE EXCEPTION 'certified chapter content mutation unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.chapters(
      book_id, chapter_number, title, content, is_generated
    )
    VALUES(
      v_book, 2, 'Late Chapter', 'This must not enter a certified manuscript.', true
    );
    RAISE EXCEPTION 'certified book accepted a new chapter';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Visibility/operational metadata is not certified manuscript identity.
  UPDATE public.books
  SET is_featured = NOT COALESCE(is_featured, false)
  WHERE id = v_book;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chapters'
      AND policyname = 'certified_chapters_delete_guard'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'certified chapter browser-delete guard missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'books'
      AND policyname = 'certified_books_delete_guard'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'certified book browser-delete guard missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publications
  WHERE work_id = v_work;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'certified manuscript guard changed publication count: %', v_count;
  END IF;
END
$$;

ROLLBACK;
 THEN
    RAISE EXCEPTION 'fixture publication hash is invalid: %', v_scope_hash;
  END IF;
  IF v_scope_hash IS NOT DISTINCT FROM v_hash_before_design THEN
    RAISE EXCEPTION 'design_settings mutation did not change publication scope hash';
  END IF;

  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'editorial', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'structural', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'qa', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'rights', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );
  PERFORM public.record_publication_gate_attestation_bound(
    v_book, v_user, 'production', 'passed', v_scope_hash, '{}'::jsonb, NULL, NULL
  );

  IF public.has_current_publication_attestations(v_book) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fixture does not satisfy current publication gates';
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'scroll_work_id', v_scroll_work_id,
    'scroll_edition_id', v_scroll_edition_id,
    'frozen_at', '2026-09-23T04:00:00Z',
    'title', 'Atomic Mint Book',
    'language', 'en',
    'edition', 'First edition',
    'print_identifier_strategy', 'kdp_free',
    'ebook_identifier_strategy', 'unassigned',
    'distribution_scope', 'kdp_only',
    'publisher', pg_catalog.jsonb_build_object(
      'mode', 'kdp_independent',
      'verification', 'kdp_free_isbn_at_submission'
    ),
    'identifiers', '[]'::jsonb,
    'isbn_by_format', '{}'::jsonb,
    'authors', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'display_name', 'Atomic Mint Author',
        'sort_order', 0
      )
    ),
    'rights_holders', '[]'::jsonb,
    'rights', '[]'::jsonb,
    'citations', '[]'::jsonb,
    'chapters', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'chapter_number', 1,
        'title', 'One'
      )
    ),
    'publication_trust', pg_catalog.jsonb_build_object(
      'scope_hash', v_scope_hash
    )
  );

  v_result := public.mint_verified_publication_release(
    v_user,
    v_work,
    v_book,
    v_scroll_edition_id,
    'original'::public.publication_edition_kind,
    'en',
    v_snapshot,
    '{}'::jsonb,
    repeat('c', 64),
    'atomic mint fixture'
  );

  v_publication := (v_result->>'publication_id')::uuid;
  IF v_publication IS NULL THEN
    RAISE EXCEPTION 'mint did not return a publication id: %', v_result;
  END IF;

  SELECT status::text, certificate_id
  INTO STRICT v_status, v_certificate
  FROM public.publications
  WHERE id = v_publication;

  IF v_status <> 'published' OR v_certificate IS NULL THEN
    RAISE EXCEPTION 'mint did not atomically publish/certify: status=% cert=%',
      v_status, v_certificate;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publication_certificates
  WHERE publication_id = v_publication
    AND content_hash = repeat('c', 64);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'publication certificate missing or duplicated: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publication_products
  WHERE publication_id = v_publication
    AND product_form = 'paperback';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'KDP-free publication product was not materialized exactly once: %', v_count;
  END IF;

  SELECT current_publication_id INTO STRICT v_work_current
  FROM public.works WHERE id = v_work;
  SELECT current_publication_id INTO STRICT v_book_current
  FROM public.books WHERE id = v_book;
  IF v_work_current IS DISTINCT FROM v_publication
     OR v_book_current IS DISTINCT FROM v_publication THEN
    RAISE EXCEPTION 'current publication pointers were not atomically advanced';
  END IF;

  -- Same frozen state with only volatile SLE/frozen_at differences is the same
  -- release request and must return the already-minted publication.
  v_retry := public.mint_verified_publication_release(
    v_user,
    v_work,
    v_book,
    'SLE-ATOMIC-MINT-FIXTURE-RETRY',
    'original'::public.publication_edition_kind,
    'en',
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_snapshot,
        '{scroll_edition_id}',
        '"SLE-ATOMIC-MINT-FIXTURE-RETRY"'::jsonb
      ),
      '{frozen_at}',
      '"2026-09-23T04:01:00Z"'::jsonb
    ),
    '{}'::jsonb,
    repeat('c', 64),
    'atomic mint fixture retry'
  );

  IF (v_retry->>'publication_id')::uuid IS DISTINCT FROM v_publication
     OR COALESCE((v_retry->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'same-state mint retry was not idempotent: %', v_retry;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.publications
  WHERE work_id = v_work;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'idempotent retry created a second publication: %', v_count;
  END IF;

  -- Published identity is immutable.
  BEGIN
    UPDATE public.publications
    SET snapshot = snapshot || '{"tampered":true}'::jsonb
    WHERE id = v_publication;
    RAISE EXCEPTION 'published snapshot mutation unexpectedly succeeded';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      NULL;
  END;

  -- Scope changes after review must not mint a second verified release from
  -- stale attestations/hash.
  UPDATE public.books
  SET title = 'Atomic Mint Book Changed After Review'
  WHERE id = v_book;

  v_new_hash := public.compute_book_publication_hash(v_book);
  IF v_new_hash IS NOT DISTINCT FROM v_scope_hash THEN
    RAISE EXCEPTION 'scope mutation failed to change publication hash';
  END IF;

  BEGIN
    PERFORM public.mint_verified_publication_release(
      v_user,
      v_work,
      v_book,
      'SLE-ATOMIC-MINT-FIXTURE-STALE',
      'original'::public.publication_edition_kind,
      'en',
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          v_snapshot,
          '{scroll_edition_id}',
          '"SLE-ATOMIC-MINT-FIXTURE-STALE"'::jsonb
        ),
        '{title}',
        '"Changed publishing state"'::jsonb
      ),
      '{}'::jsonb,
      repeat('d', 64),
      'stale scope fixture'
    );
    RAISE EXCEPTION 'stale scope unexpectedly minted';
  EXCEPTION
    WHEN serialization_failure THEN
      NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.publications
  WHERE work_id = v_work;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'stale scope attempt created a publication: %', v_count;
  END IF;
END
$$;

ROLLBACK;
