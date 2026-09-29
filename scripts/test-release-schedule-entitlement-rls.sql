\set ON_ERROR_STOP on

BEGIN;

-- Fixed fixture ids make auth.uid() role changes easy to reason about.
INSERT INTO auth.users(id)
VALUES
  ('95000000-0000-4000-8000-000000000001'),
  ('95000000-0000-4000-8000-000000000002');

INSERT INTO public.creator_entitlements(
  user_id, tier, can_schedule_releases, payment_status
)
VALUES
  ('95000000-0000-4000-8000-000000000001', 'creator_pro', true, 'active'),
  ('95000000-0000-4000-8000-000000000002', 'free', false, 'active');

INSERT INTO public.books(id, user_id, title, category)
VALUES
  ('95100000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'Entitled RLS Book', 'non_fiction'),
  ('95100000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002', 'Free RLS Book', 'non_fiction');

-- The underlying entitlement policies remain installed for the post-GA
-- re-enable path, but the final GA launch migration removes browser mutation
-- privileges entirely. Both layers are intentional and must remain true.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'release_schedules' AND policyname LIKE 'release_schedules_entitled_%')
        OR
        (tablename = 'release_schedule_items' AND policyname LIKE 'release_schedule_items_entitled_%')
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'release scheduling entitlement RLS policy set is incomplete';
  END IF;

  IF has_table_privilege('authenticated', 'public.release_schedules', 'INSERT')
     OR has_table_privilege('authenticated', 'public.release_schedules', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.release_schedules', 'DELETE')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'DELETE') THEN
    RAISE EXCEPTION 'GA browser release-scheduling mutation privileges unexpectedly enabled';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.release_schedules', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.release_schedule_items', 'INSERT') THEN
    RAISE EXCEPTION 'service role lost release scheduling authority';
  END IF;
END
$$;

-- Seed a historical schedule/item for the free user as the trusted DB owner.
-- The free owner must retain read visibility but lose mutation rights.
INSERT INTO public.release_schedules(
  id, book_id, owner_user_id, cadence, channel, start_at
)
VALUES(
  '95200000-0000-4000-8000-000000000002',
  '95100000-0000-4000-8000-000000000002',
  '95000000-0000-4000-8000-000000000002',
  'weekly', 'platform', now()
);

INSERT INTO public.release_schedule_items(
  id, schedule_id, chapter_number, release_at, status
)
VALUES(
  '95300000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000002',
  1, now() + interval '1 day', 'scheduled'
);

SET LOCAL ROLE authenticated;

-- Free/lapsed owner: direct browser-style mutations must fail closed.
SELECT set_config(
  'request.jwt.claim.sub',
  '95000000-0000-4000-8000-000000000002',
  true
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.release_schedules
    WHERE id = '95200000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'free owner lost read access to historical schedule';
  END IF;

  BEGIN
    INSERT INTO public.release_schedules(
      book_id, owner_user_id, cadence, channel, start_at
    )
    VALUES(
      '95100000-0000-4000-8000-000000000002',
      '95000000-0000-4000-8000-000000000002',
      'weekly', 'platform', now()
    );
    RAISE EXCEPTION 'free owner created a schedule through direct table access';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.release_schedules
    SET cadence = 'daily'
    WHERE id = '95200000-0000-4000-8000-000000000002';
    IF FOUND THEN
      RAISE EXCEPTION 'free owner updated a historical schedule';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.release_schedule_items(
      schedule_id, chapter_number, release_at, status
    )
    VALUES(
      '95200000-0000-4000-8000-000000000002',
      2, now() + interval '2 days', 'scheduled'
    );
    RAISE EXCEPTION 'free owner created a release item';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.release_schedule_items
    WHERE id = '95300000-0000-4000-8000-000000000002';
    IF FOUND THEN
      RAISE EXCEPTION 'free owner deleted a historical release item';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- Entitled owner: the entitlement policy remains correct, but the GA launch
-- privilege boundary must still fail closed until hosted due-item E2E is proven.
SELECT set_config(
  'request.jwt.claim.sub',
  '95000000-0000-4000-8000-000000000001',
  true
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.release_schedules(
      id, book_id, owner_user_id, cadence, channel, start_at
    )
    VALUES(
      '95200000-0000-4000-8000-000000000001',
      '95100000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001',
      'weekly', 'platform', now()
    );
    RAISE EXCEPTION 'entitled owner bypassed GA browser scheduling lock';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

RESET ROLE;
ROLLBACK;
