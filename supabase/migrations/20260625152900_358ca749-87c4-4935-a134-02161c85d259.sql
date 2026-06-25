
-- =========================================================================
-- Phase 2.1 — Evidence & Citation Engine + Publisher Design System
-- Additive migration. Existing data preserved.
-- =========================================================================

-- ---------- book_citations: structured evidence ledger -------------------

ALTER TABLE public.book_citations
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS authors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS container_title text,
  ADD COLUMN IF NOT EXISTS volume text,
  ADD COLUMN IF NOT EXISTS issue text,
  ADD COLUMN IF NOT EXISTS pages text,
  ADD COLUMN IF NOT EXISTS doi text,
  ADD COLUMN IF NOT EXISTS isbn text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS accessed_at date,
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS citation_key text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Validate enums via trigger (avoids CHECK immutability issues on future changes)
CREATE OR REPLACE FUNCTION public.validate_book_citation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type IS NULL THEN
    NEW.source_type := COALESCE(NULLIF(NEW.citation_type, ''), 'journal_article');
  END IF;
  IF NEW.source_type NOT IN (
    'journal_article','book','government_report','company_report',
    'white_paper','news_article','standard','regulation','website','dataset'
  ) THEN
    NEW.source_type := 'journal_article';
  END IF;
  IF NEW.confidence NOT IN ('verified','unverified','requires_review') THEN
    NEW.confidence := 'unverified';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_book_citation ON public.book_citations;
CREATE TRIGGER trg_validate_book_citation
  BEFORE INSERT OR UPDATE ON public.book_citations
  FOR EACH ROW EXECUTE FUNCTION public.validate_book_citation();

-- Backfill: source_type from legacy citation_type; citation_key from author+year
UPDATE public.book_citations
SET source_type = CASE
  WHEN citation_type ILIKE 'journal%' THEN 'journal_article'
  WHEN citation_type ILIKE 'book%' THEN 'book'
  WHEN citation_type ILIKE 'website%' OR citation_type ILIKE 'web%' THEN 'website'
  WHEN citation_type ILIKE 'news%' THEN 'news_article'
  WHEN citation_type ILIKE 'report%' THEN 'company_report'
  ELSE 'journal_article'
END
WHERE source_type IS NULL;

UPDATE public.book_citations
SET citation_key = lower(
  regexp_replace(
    coalesce(split_part(author, ',', 1), 'source'),
    '[^a-zA-Z0-9]', '', 'g'
  )
) || coalesce(
  substring(publication_date from '\d{4}'),
  to_char(created_at, 'YYYY')
) || '_' || substring(id::text, 1, 4)
WHERE citation_key IS NULL;

ALTER TABLE public.book_citations
  ALTER COLUMN citation_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS book_citations_book_key_idx
  ON public.book_citations(book_id, citation_key);
CREATE INDEX IF NOT EXISTS book_citations_book_idx
  ON public.book_citations(book_id);
CREATE INDEX IF NOT EXISTS book_citations_doi_idx
  ON public.book_citations(doi) WHERE doi IS NOT NULL;

-- ---------- books.design_settings ----------------------------------------

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS design_settings jsonb NOT NULL DEFAULT jsonb_build_object(
    'preset', 'editorial',
    'font_pair', 'spectral_inter',
    'trim_size', 'us_letter',
    'accent_color', '#1d4ed8',
    'header_style', 'title_chapter',
    'footer_style', 'page_center',
    'endnotes_per_chapter', false,
    'citation_style', 'apa'
  );

-- ---------- publications.design_snapshot (immutable after publish) -------

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS design_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.lock_publication_design_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.design_snapshot IS NOT NULL
     AND OLD.status IN ('published','archived')
     AND NEW.design_snapshot IS DISTINCT FROM OLD.design_snapshot THEN
    RAISE EXCEPTION 'design_snapshot is immutable once a publication is published';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_publication_design_snapshot ON public.publications;
CREATE TRIGGER trg_lock_publication_design_snapshot
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.lock_publication_design_snapshot();
