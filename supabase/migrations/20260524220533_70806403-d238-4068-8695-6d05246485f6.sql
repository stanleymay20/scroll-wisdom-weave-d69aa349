
-- Dedupe: one followed_author_release per (user, resource_id)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_creator_notifications_follow_release
  ON public.creator_notifications (user_id, resource_id)
  WHERE kind = 'followed_author_release' AND resource_id IS NOT NULL;

-- 3.1b: trigger on public_listings -> notify followers
CREATE OR REPLACE FUNCTION public.notify_followers_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _author uuid;
  _title text;
  _slug text;
BEGIN
  IF NEW.is_public IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_public, false) = true THEN
    RETURN NEW;
  END IF;

  SELECT b.user_id, b.title INTO _author, _title
  FROM public.books b WHERE b.id = NEW.book_id;
  IF _author IS NULL THEN RETURN NEW; END IF;

  SELECT ap.slug INTO _slug FROM public.author_profiles ap WHERE ap.user_id = _author;

  INSERT INTO public.creator_notifications (
    user_id, kind, title, body, link_url,
    resource_type, resource_id, metadata
  )
  SELECT
    af.follower_user_id,
    'followed_author_release',
    COALESCE(_title, 'New release'),
    'A creator you follow just published a new book.',
    '/book/' || NEW.slug,
    'public_listing',
    NEW.id::text,
    jsonb_build_object(
      'book_id', NEW.book_id,
      'listing_id', NEW.id,
      'listing_slug', NEW.slug,
      'author_user_id', _author,
      'author_slug', _slug,
      'title', _title,
      'source', 'listing_publish_trigger'
    )
  FROM public.author_followers af
  WHERE af.author_user_id = _author
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_publish_ins ON public.public_listings;
CREATE TRIGGER trg_notify_followers_on_publish_ins
AFTER INSERT ON public.public_listings
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_publish();

DROP TRIGGER IF EXISTS trg_notify_followers_on_publish_upd ON public.public_listings;
CREATE TRIGGER trg_notify_followers_on_publish_upd
AFTER UPDATE OF is_public ON public.public_listings
FOR EACH ROW
WHEN (NEW.is_public = true AND COALESCE(OLD.is_public, false) = false)
EXECUTE FUNCTION public.notify_followers_on_publish();

-- 3.1c helper: notify followers when a scheduled chapter releases.
CREATE OR REPLACE FUNCTION public.notify_followers_on_schedule_release(_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item record;
  _sched record;
  _book record;
  _listing record;
  _author_slug text;
  _inserted int := 0;
BEGIN
  SELECT * INTO _item FROM public.release_schedule_items WHERE id = _item_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO _sched FROM public.release_schedules WHERE id = _item.schedule_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT id, user_id, title INTO _book FROM public.books WHERE id = _sched.book_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT id, slug INTO _listing FROM public.public_listings
    WHERE book_id = _book.id AND is_public = true LIMIT 1;
  IF _listing.id IS NULL THEN RETURN 0; END IF;

  SELECT slug INTO _author_slug FROM public.author_profiles WHERE user_id = _book.user_id;

  WITH ins AS (
    INSERT INTO public.creator_notifications (
      user_id, kind, title, body, link_url,
      resource_type, resource_id, metadata
    )
    SELECT
      af.follower_user_id,
      'followed_author_release',
      COALESCE(_book.title, 'New chapter') || ' — new chapter',
      'A new chapter just released in a series you follow.',
      '/book/' || _listing.slug,
      'release_schedule_item',
      _item.id::text,
      jsonb_build_object(
        'book_id', _book.id,
        'listing_id', _listing.id,
        'listing_slug', _listing.slug,
        'chapter_id', _item.chapter_id,
        'chapter_number', _item.chapter_number,
        'author_user_id', _book.user_id,
        'author_slug', _author_slug,
        'title', _book.title,
        'source', 'release_schedule_worker'
      )
    FROM public.author_followers af
    WHERE af.author_user_id = _book.user_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _inserted FROM ins;

  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_followers_on_schedule_release(uuid) FROM PUBLIC, anon, authenticated;
