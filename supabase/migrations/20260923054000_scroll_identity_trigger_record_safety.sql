-- Make the shared Scroll identity immutability trigger record-shape safe.
--
-- A trigger RECORD only exposes columns from the table that fired it. Referencing
-- NEW.scroll_work_id in a boolean expression fired by publications can raise
-- "record NEW has no field scroll_work_id" before logical short-circuiting helps.

CREATE OR REPLACE FUNCTION public.tg_protect_scroll_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'works' THEN
    IF NEW.scroll_work_id IS DISTINCT FROM OLD.scroll_work_id THEN
      RAISE EXCEPTION 'SCROLL_WORK_ID_IMMUTABLE'
        USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_NAME = 'publications' THEN
    IF NEW.scroll_edition_id IS DISTINCT FROM OLD.scroll_edition_id THEN
      RAISE EXCEPTION 'SCROLL_EDITION_ID_IMMUTABLE'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'SCROLL_IDENTITY_TRIGGER_UNEXPECTED_TABLE:%', TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_protect_scroll_identity()
  FROM PUBLIC, anon, authenticated;
