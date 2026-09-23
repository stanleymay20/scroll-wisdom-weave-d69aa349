# Live ISBN planner-compatibility repair evidence

Status: **REPOSITORY-SIDE EVIDENCE ONLY — NOT EXECUTED**

Scope: one surgical compatibility repair for `public.isbn_inventory` on ScrollLibrary Live.

Target transformation:

```
function-based CHECK
  public.isbn_inventory.isbn_inventory_valid_isbn
  CHECK (is_valid_isbn13(isbn13))

->

BEFORE INSERT OR UPDATE OF isbn13 trigger
  public.isbn_inventory.isbn_inventory_valid_isbn_trg
  using public.enforce_isbn_inventory_valid_isbn()
```

This artifact does **not** authorize execution, publish, deployment, migration replay, or any other production mutation.

## Safety boundary

The operation must:

- be executed only after an independent Live preflight confirms the expected state;
- be one transaction;
- fail closed on unexpected schema state;
- preserve the same `public.is_valid_isbn13(text)` predicate;
- preserve SQLSTATE `23514` for invalid ISBNs;
- keep `isbn13` NOT NULL and UNIQUE;
- leave all unrelated PK / UNIQUE / FK / source / status constraints intact;
- leave indexes intact;
- leave Live data at zero rows;
- not create `isbn_claim_requests`;
- not create the assignment-locking trigger;
- not alter migration history;
- not alter RLS;
- not alter existing table grants;
- not alter storage;
- not alter cron;
- not publish.

The controlled RC lineage defines `public.is_valid_isbn13(text)` as immutable, strict, and search-path hardened. The canonical ISBN inventory definition uses `isbn13 text NOT NULL UNIQUE` and the named function-based CHECK.

## Corrected repair transaction

The earlier draft was rejected because it used `CREATE OR REPLACE FUNCTION` and `DROP TRIGGER IF EXISTS`, either of which could silently overwrite unexpected Live state. It also did not directly prove the UPDATE trigger path and could allow the still-present CHECK to masquerade as proof of trigger enforcement.

The corrected transaction is fail-closed and proves the replacement trigger both before and after CHECK removal.

```sql
BEGIN;

-- Establish the target relation before taking the surgery lock.
DO $$
BEGIN
  IF to_regclass('public.isbn_inventory') IS NULL THEN
    RAISE EXCEPTION
      'precondition failed: public.isbn_inventory missing';
  END IF;
END $$;

-- Freeze the target table for the complete
-- precondition -> replacement -> proof sequence.
LOCK TABLE public.isbn_inventory IN ACCESS EXCLUSIVE MODE;

-- Fail closed unless Live is exactly in the expected pre-repair state.
DO $$
BEGIN
  IF to_regprocedure('public.is_valid_isbn13(text)') IS NULL THEN
    RAISE EXCEPTION
      'precondition failed: public.is_valid_isbn13(text) missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.is_valid_isbn13(text)'::regprocedure
      AND proisstrict
  ) THEN
    RAISE EXCEPTION
      'precondition failed: public.is_valid_isbn13(text) is not STRICT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.isbn_inventory'::regclass
      AND attname = 'isbn13'
      AND NOT attisdropped
      AND attnotnull
  ) THEN
    RAISE EXCEPTION
      'precondition failed: isbn_inventory.isbn13 is not NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.isbn_inventory'::regclass
      AND conname = 'isbn_inventory_valid_isbn'
      AND contype = 'c'
      AND pg_get_constraintdef(oid) =
          'CHECK (is_valid_isbn13(isbn13))'
  ) THEN
    RAISE EXCEPTION
      'precondition failed: isbn_inventory_valid_isbn absent or not the expected definition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.isbn_inventory'::regclass
      AND conname = 'isbn_inventory_isbn13_key'
      AND contype = 'u'
  ) THEN
    RAISE EXCEPTION
      'precondition failed: uniqueness constraint missing';
  END IF;

  -- A pre-existing replacement function is unexpected Live state.
  -- Never overwrite it silently.
  IF to_regprocedure(
       'public.enforce_isbn_inventory_valid_isbn()'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'precondition failed: enforcement trigger function unexpectedly already exists';
  END IF;

  -- A pre-existing replacement trigger is also unexpected state.
  -- Never drop or redefine it silently.
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.isbn_inventory'::regclass
      AND tgname = 'isbn_inventory_valid_isbn_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'precondition failed: replacement trigger unexpectedly already exists';
  END IF;

  IF (SELECT count(*) FROM public.isbn_inventory) <> 0 THEN
    RAISE EXCEPTION
      'precondition failed: isbn_inventory is not empty; re-audit before schema surgery';
  END IF;

  -- The valid-ISBN probe below expects this UUID to fail on the imprint FK.
  IF EXISTS (
    SELECT 1
    FROM public.publishing_imprints
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
  ) THEN
    RAISE EXCEPTION
      'precondition failed: zero UUID unexpectedly exists in publishing_imprints';
  END IF;

  IF public.is_valid_isbn13('9780306406157') IS NOT TRUE
     OR public.is_valid_isbn13('9780306406158') IS NOT FALSE
     OR public.is_valid_isbn13('not-an-isbn') IS NOT FALSE THEN
    RAISE EXCEPTION
      'precondition failed: is_valid_isbn13 behaviour unexpected';
  END IF;
END $$;

-- Create a genuinely new trigger function. Do not replace unknown Live state.
CREATE FUNCTION public.enforce_isbn_inventory_valid_isbn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.isbn13 IS NOT NULL
     AND NOT public.is_valid_isbn13(NEW.isbn13) THEN
    RAISE EXCEPTION 'invalid ISBN-13: %', NEW.isbn13
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger functions do not need to be exposed as callable public API.
REVOKE ALL ON FUNCTION public.enforce_isbn_inventory_valid_isbn()
FROM PUBLIC, anon, authenticated;

-- Create a genuinely new trigger. Never DROP an unexpected Live trigger.
CREATE TRIGGER isbn_inventory_valid_isbn_trg
BEFORE INSERT OR UPDATE OF isbn13
ON public.isbn_inventory
FOR EACH ROW
EXECUTE FUNCTION public.enforce_isbn_inventory_valid_isbn();

-- Prove exact target trigger shape and enablement.
DO $$
DECLARE
  d text;
  e "char";
BEGIN
  SELECT pg_get_triggerdef(oid), tgenabled
    INTO d, e
  FROM pg_trigger
  WHERE tgrelid = 'public.isbn_inventory'::regclass
    AND tgname = 'isbn_inventory_valid_isbn_trg'
    AND NOT tgisinternal;

  IF d IS NULL THEN
    RAISE EXCEPTION
      'assert failed: replacement trigger not created';
  END IF;

  IF e <> 'O' THEN
    RAISE EXCEPTION
      'assert failed: replacement trigger not enabled (tgenabled=%)', e;
  END IF;

  IF position(
       'BEFORE INSERT OR UPDATE OF isbn13' IN d
     ) = 0 THEN
    RAISE EXCEPTION
      'assert failed: unexpected trigger timing/scope: %', d;
  END IF;
END $$;

-- Prove the actual target-table trigger fires BEFORE relying on it.
-- Matching the trigger's distinctive message prevents the still-present
-- CHECK constraint from masquerading as proof of trigger enforcement.
DO $$
DECLARE
  got_state text;
  got_message text;
  got_constraint text;
BEGIN
  BEGIN
    INSERT INTO public.isbn_inventory (
      imprint_id, isbn13, source
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      '9780306406158',
      'platform_pool'
    );

    RAISE EXCEPTION
      'assert failed: invalid checksum was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;

    IF got_state <> '23514'
       OR got_message <> 'invalid ISBN-13: 9780306406158' THEN
      RAISE EXCEPTION
        'assert failed: invalid ISBN was not rejected by replacement trigger (state=%, message=%)',
        got_state, got_message;
    END IF;
  END;

  BEGIN
    INSERT INTO public.isbn_inventory (
      imprint_id, isbn13, source
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'not-an-isbn',
      'platform_pool'
    );

    RAISE EXCEPTION
      'assert failed: malformed ISBN was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;

    IF got_state <> '23514'
       OR got_message <> 'invalid ISBN-13: not-an-isbn' THEN
      RAISE EXCEPTION
        'assert failed: malformed ISBN was not rejected by replacement trigger (state=%, message=%)',
        got_state, got_message;
    END IF;
  END;

  -- A valid ISBN must pass ISBN validation and reach the known FK.
  BEGIN
    INSERT INTO public.isbn_inventory (
      imprint_id, isbn13, source
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      '9780306406157',
      'platform_pool'
    );

    RAISE EXCEPTION
      'assert failed: valid-ISBN probe unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_constraint = CONSTRAINT_NAME;

    IF got_state <> '23503'
       OR got_constraint <> 'isbn_inventory_imprint_id_fkey' THEN
      RAISE EXCEPTION
        'assert failed: valid ISBN did not reach expected FK (state=%, constraint=%)',
        got_state, got_constraint;
    END IF;
  END;
END $$;

-- Explicitly prove UPDATE semantics without writing a persistent Live row.
CREATE TEMP TABLE _isbn_validation_probe (
  isbn13 text
) ON COMMIT DROP;

CREATE TRIGGER _isbn_validation_probe_trg
BEFORE INSERT OR UPDATE OF isbn13
ON _isbn_validation_probe
FOR EACH ROW
EXECUTE FUNCTION public.enforce_isbn_inventory_valid_isbn();

INSERT INTO _isbn_validation_probe(isbn13)
VALUES ('9780306406157');

DO $$
DECLARE
  got_state text;
  got_message text;
BEGIN
  BEGIN
    UPDATE _isbn_validation_probe
    SET isbn13 = '9780306406158';

    RAISE EXCEPTION
      'assert failed: UPDATE accepted an invalid ISBN';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;

    IF got_state <> '23514'
       OR got_message <> 'invalid ISBN-13: 9780306406158' THEN
      RAISE EXCEPTION
        'assert failed: UPDATE validation did not come from replacement trigger (state=%, message=%)',
        got_state, got_message;
    END IF;
  END;
END $$;

-- Drop ONLY the planner-incompatible CHECK after the replacement is proven.
ALTER TABLE public.isbn_inventory
DROP CONSTRAINT isbn_inventory_valid_isbn;

-- Prove trigger-alone validation after the CHECK is gone.
DO $$
DECLARE
  got_state text;
  got_message text;
BEGIN
  BEGIN
    INSERT INTO public.isbn_inventory (
      imprint_id, isbn13, source
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      '9780306406158',
      'platform_pool'
    );

    RAISE EXCEPTION
      'post-assert failed: invalid ISBN accepted after CHECK removal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      got_state = RETURNED_SQLSTATE,
      got_message = MESSAGE_TEXT;

    IF got_state <> '23514'
       OR got_message <> 'invalid ISBN-13: 9780306406158' THEN
      RAISE EXCEPTION
        'post-assert failed: trigger-alone validation failed (state=%, message=%)',
        got_state, got_message;
    END IF;
  END;
END $$;

-- Final structural postconditions.
DO $$
DECLARE
  e "char";
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.isbn_inventory'::regclass
      AND conname = 'isbn_inventory_valid_isbn'
  ) THEN
    RAISE EXCEPTION
      'post-assert failed: planner-incompatible CHECK still present';
  END IF;

  SELECT tgenabled INTO e
  FROM pg_trigger
  WHERE tgrelid = 'public.isbn_inventory'::regclass
    AND tgname = 'isbn_inventory_valid_isbn_trg'
    AND NOT tgisinternal;

  IF e IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION
      'post-assert failed: validation trigger missing or disabled';
  END IF;

  -- Six independent unrelated constraints must all remain.
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('isbn_inventory_pkey',            'p'::"char"),
        ('isbn_inventory_isbn13_key',      'u'::"char"),
        ('isbn_inventory_added_by_fkey',   'f'::"char"),
        ('isbn_inventory_imprint_id_fkey', 'f'::"char"),
        ('isbn_inventory_source_check',    'c'::"char"),
        ('isbn_inventory_status_check',    'c'::"char")
    ) AS expected(conname, contype)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint actual
      WHERE actual.conrelid =
            'public.isbn_inventory'::regclass
        AND actual.conname = expected.conname
        AND actual.contype = expected.contype
    )
  ) THEN
    RAISE EXCEPTION
      'post-assert failed: an unrelated constraint is missing or changed type';
  END IF;

  IF (SELECT count(*)
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'isbn_inventory') <> 3
     OR NOT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'isbn_inventory'
         AND indexname = 'isbn_inventory_pkey'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'isbn_inventory'
         AND indexname = 'isbn_inventory_isbn13_key'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'isbn_inventory'
         AND indexname = 'isbn_inventory_available_idx'
     ) THEN
    RAISE EXCEPTION
      'post-assert failed: expected isbn_inventory index set changed';
  END IF;

  IF (SELECT count(*) FROM public.isbn_inventory) <> 0 THEN
    RAISE EXCEPTION
      'post-assert failed: isbn_inventory row count changed';
  END IF;
END $$;

COMMIT;
```

## Read-only post-commit verification

Run only after a separately authorized execution succeeds.

```sql
SELECT count(*) AS isbn_inventory_rows
FROM public.isbn_inventory;
-- expect: 0

SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.isbn_inventory'::regclass
ORDER BY conname;
-- expect:
--   isbn_inventory_valid_isbn absent
--   unrelated PK / UNIQUE / FK / source / status constraints intact

SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.isbn_inventory'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
-- expect:
--   existing timestamp trigger intact
--   isbn_inventory_valid_isbn_trg enabled

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'isbn_inventory'
ORDER BY indexname;
-- expect exactly the previously audited three indexes

SELECT polname, cmd, qual, with_check
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'isbn_inventory'
ORDER BY polname;
-- compare to the captured preflight snapshot; expect unchanged

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'isbn_inventory'
ORDER BY grantee, privilege_type;
-- compare to preflight snapshot; expect unchanged

SELECT conrelid::regclass::text,
       conname,
       pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_depend d
  ON d.objid = c.oid
 AND d.classid = 'pg_constraint'::regclass
JOIN pg_proc pr
  ON pr.oid = d.refobjid
 AND d.refclassid = 'pg_proc'::regclass
WHERE c.contype = 'c'
  AND pr.pronamespace = 'public'::regnamespace
ORDER BY 1, 2;
-- planner target: no remaining public function-dependent CHECK constraints
```

## Required execution sequence

If and only if the user explicitly authorizes the production repair after an independent Live preflight:

```
capture Live preflight evidence
-> execute this one transaction
-> run read-only post-commit verification
-> rerun Lovable database-change planner only
-> capture computed delta or exact new error
-> STOP
```

A successful planner run is **not** authorization to publish.

If the planner still fails, stop at the exact new planner error. Do not delete or weaken additional production constraints merely to make planning succeed.

If the planner succeeds, capture and audit the proposed Test-to-Live delta for destructive drops, Live-only object loss, bucket deletion, RLS weakening, privilege escalation, migration-history replay, and ISBN/publication invariant loss before any further release action.
