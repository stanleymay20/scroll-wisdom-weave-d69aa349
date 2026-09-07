-- Lock core ISBN identity and reviewed audit history at the database boundary.

CREATE OR REPLACE FUNCTION public.tg_lock_isbn_inventory_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.isbn13 IS DISTINCT FROM OLD.isbn13
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.imprint_id IS DISTINCT FROM OLD.imprint_id
     OR NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id
     OR NEW.added_by IS DISTINCT FROM OLD.added_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ISBN_INVENTORY_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_lock_isbn_inventory_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_isbn_inventory_identity ON public.isbn_inventory;
CREATE TRIGGER trg_lock_isbn_inventory_identity
BEFORE UPDATE ON public.isbn_inventory
FOR EACH ROW EXECUTE FUNCTION public.tg_lock_isbn_inventory_identity();

CREATE OR REPLACE FUNCTION public.tg_lock_published_isbn_assignment_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL OR OLD.locked_publication_id IS NOT NULL THEN
    IF NEW.book_id IS DISTINCT FROM OLD.book_id
       OR NEW.isbn_id IS DISTINCT FROM OLD.isbn_id
       OR NEW.product_form IS DISTINCT FROM OLD.product_form
       OR NEW.language IS DISTINCT FROM OLD.language
       OR NEW.edition_label IS DISTINCT FROM OLD.edition_label
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.locked_publication_id IS DISTINCT FROM OLD.locked_publication_id THEN
      RAISE EXCEPTION 'ISBN_ASSIGNMENT_PUBLICATION_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_lock_published_isbn_assignment_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_published_isbn_assignment_identity ON public.book_isbn_assignments;
CREATE TRIGGER trg_lock_published_isbn_assignment_identity
BEFORE UPDATE ON public.book_isbn_assignments
FOR EACH ROW EXECUTE FUNCTION public.tg_lock_published_isbn_assignment_identity();

CREATE OR REPLACE FUNCTION public.tg_platform_isbn_batch_item_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ISBN_POOL_BATCH_ITEM_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.tg_platform_isbn_batch_item_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_isbn_batch_item_immutable ON public.platform_isbn_pool_verification_batch_items;
CREATE TRIGGER trg_platform_isbn_batch_item_immutable
BEFORE UPDATE OR DELETE ON public.platform_isbn_pool_verification_batch_items
FOR EACH ROW EXECUTE FUNCTION public.tg_platform_isbn_batch_item_immutable();

CREATE OR REPLACE FUNCTION public.tg_platform_isbn_batch_delete_forbidden()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ISBN_POOL_BATCH_DELETE_FORBIDDEN' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.tg_platform_isbn_batch_delete_forbidden() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_isbn_batch_delete_forbidden ON public.platform_isbn_pool_verification_batches;
CREATE TRIGGER trg_platform_isbn_batch_delete_forbidden
BEFORE DELETE ON public.platform_isbn_pool_verification_batches
FOR EACH ROW EXECUTE FUNCTION public.tg_platform_isbn_batch_delete_forbidden();
