
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ensure_individual_rights_holder(_user_id UUID, _display_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rh_id UUID;
  fallback_name TEXT;
BEGIN
  SELECT id INTO rh_id FROM public.rights_holders
   WHERE user_id = _user_id AND holder_type = 'individual' LIMIT 1;
  IF rh_id IS NOT NULL THEN RETURN rh_id; END IF;

  fallback_name := COALESCE(
    _display_name,
    (SELECT NULLIF(full_name,'') FROM public.profiles WHERE user_id = _user_id LIMIT 1),
    (SELECT email FROM auth.users WHERE id = _user_id LIMIT 1),
    'Author'
  );

  INSERT INTO public.rights_holders(holder_type, user_id, display_name)
  VALUES ('individual', _user_id, fallback_name)
  RETURNING id INTO rh_id;
  RETURN rh_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_individual_rights_holder(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._phase1_backfill_works()
RETURNS TABLE(books_processed INT, works_created INT, pubs_created INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  b RECORD; owner_user UUID; rh_id UUID; new_work_id UUID; display TEXT;
  snap JSONB; hash TEXT; pub_id UUID; cert_id UUID;
  cnt_books INT := 0; cnt_works INT := 0; cnt_pubs INT := 0;
BEGIN
  FOR b IN
    SELECT id, user_id, creator_id, title, description, language, category, is_published,
           work_id, current_publication_id, created_at
    FROM public.books
  LOOP
    cnt_books := cnt_books + 1;
    owner_user := COALESCE(b.creator_id, b.user_id);
    IF owner_user IS NULL THEN CONTINUE; END IF;

    rh_id := public.ensure_individual_rights_holder(owner_user, NULL);

    IF b.work_id IS NULL THEN
      INSERT INTO public.works(title, original_language, work_type, description, owner_rights_holder_id, created_by)
      VALUES (COALESCE(NULLIF(b.title,''), 'Untitled'), COALESCE(NULLIF(b.language,''), 'en'),
              'book', b.description, rh_id, owner_user)
      RETURNING id INTO new_work_id;
      UPDATE public.books SET work_id = new_work_id WHERE id = b.id;
      cnt_works := cnt_works + 1;
    ELSE
      new_work_id := b.work_id;
    END IF;

    display := COALESCE(
      (SELECT NULLIF(full_name,'') FROM public.profiles WHERE user_id = owner_user LIMIT 1),
      (SELECT email FROM auth.users WHERE id = owner_user LIMIT 1),
      'Author'
    );

    IF NOT EXISTS (SELECT 1 FROM public.work_authors WHERE work_id = new_work_id AND author_role = 'primary') THEN
      INSERT INTO public.work_authors(work_id, user_id, display_name, author_role, sort_order, verified)
      VALUES (new_work_id, owner_user, display, 'primary', 0, true);
    END IF;

    INSERT INTO public.work_rights(work_id, rights_holder_id, rights_class, created_by)
    SELECT new_work_id, rh_id, rc, owner_user
    FROM (VALUES ('attribution'::public.rights_class),
                 ('integrity'::public.rights_class),
                 ('name_protection'::public.rights_class),
                 ('copyright_holder'::public.rights_class)) AS t(rc)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.work_rights wr
      WHERE wr.work_id = new_work_id AND wr.rights_class = t.rc
        AND wr.rights_holder_id = rh_id AND wr.effective_to IS NULL
    );

    IF b.is_published AND b.current_publication_id IS NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.publications
        WHERE work_id = new_work_id AND edition_kind = 'original'
          AND language = COALESCE(NULLIF(b.language,''), 'en') AND version = 'v1.0.0'
      ) THEN
        SELECT jsonb_build_object(
          'work_id', new_work_id, 'book_id', b.id, 'title', b.title, 'description', b.description,
          'language', COALESCE(NULLIF(b.language,''), 'en'), 'category', b.category,
          'authors', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('display_name', wa.display_name, 'role', wa.author_role) ORDER BY wa.sort_order)
            FROM public.work_authors wa WHERE wa.work_id = new_work_id), '[]'::jsonb),
          'copyright_holder', display,
          'chapters', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', c.id, 'chapter_number', c.chapter_number, 'title', c.title) ORDER BY c.chapter_number)
            FROM public.chapters c WHERE c.book_id = b.id), '[]'::jsonb),
          'snapshot_taken_at', now()
        ) INTO snap;

        hash := encode(extensions.digest(snap::text, 'sha256'), 'hex');

        INSERT INTO public.publications(work_id, edition_kind, language, version, semver_major, semver_minor, semver_patch,
                                        status, integrity_level, snapshot, content_hash, published_at, published_by)
        VALUES (new_work_id, 'original', COALESCE(NULLIF(b.language,''), 'en'), 'v1.0.0', 1, 0, 0,
                'published', 'verified_published', snap, hash, b.created_at, owner_user)
        RETURNING id INTO pub_id;

        INSERT INTO public.publication_certificates(publication_id, work_id, authors_snapshot, rights_holders_snapshot,
                                                    content_hash, signature_algorithm, issuer, scrolllibrary_version)
        VALUES (pub_id, new_work_id, COALESCE(snap->'authors', '[]'::jsonb),
                jsonb_build_object('copyright_holder', display),
                hash, 'sha256', 'scrolllibrary', 'phase1-backfill')
        RETURNING id INTO cert_id;

        UPDATE public.publications SET certificate_id = cert_id WHERE id = pub_id;
        UPDATE public.books SET current_publication_id = pub_id, work_id = new_work_id WHERE id = b.id;
        UPDATE public.works SET current_publication_id = pub_id WHERE id = new_work_id;
        cnt_pubs := cnt_pubs + 1;
      END IF;
    END IF;
  END LOOP;

  books_processed := cnt_books; works_created := cnt_works; pubs_created := cnt_pubs;
  RETURN NEXT;
END $$;

SELECT * FROM public._phase1_backfill_works();

REVOKE ALL ON FUNCTION public._phase1_backfill_works() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._phase1_backfill_works() TO service_role;
