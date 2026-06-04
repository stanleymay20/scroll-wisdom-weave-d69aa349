-- ============================================================================
-- Elite-tier publishing metadata: AI disclosure, ISBN, dedication, epigraph.
-- ----------------------------------------------------------------------------
-- Amazon KDP requires creators to declare AI usage on submission. The bundle
-- pipeline reads `books.ai_assistance_level` and renders the disclosure both
-- in the front matter and in a stand-alone `ai-disclosure.md` ready to paste
-- into the KDP submission form. Missing disclosure blocks the KDP bundle.
--
-- Dedication and epigraph are optional polish that distinguishes a hobby
-- export from a publisher-grade one — front matter renders both when set.
--
-- ISBN, when supplied, prints on the copyright page and is recorded in
-- metadata.json so downstream tooling can wire it into KDP / Ingram feeds.
-- ============================================================================

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS ai_assistance_level text
    CHECK (ai_assistance_level IS NULL OR ai_assistance_level IN ('none', 'assisted', 'generated')),
  ADD COLUMN IF NOT EXISTS isbn text,
  ADD COLUMN IF NOT EXISTS dedication text,
  ADD COLUMN IF NOT EXISTS epigraph jsonb;

COMMENT ON COLUMN public.books.ai_assistance_level IS
  'Author-declared AI use: none / assisted (outline/edit) / generated (drafted by AI). Required for KDP submission per Amazon policy.';
COMMENT ON COLUMN public.books.isbn IS 'Optional ISBN-10/13. Rendered on the copyright page.';
COMMENT ON COLUMN public.books.dedication IS 'Optional dedication line shown on its own page in the front matter.';
COMMENT ON COLUMN public.books.epigraph IS 'Optional epigraph {text, attribution} shown above the copyright page.';

-- Index for dashboards: how many of our exported books have declared AI use?
CREATE INDEX IF NOT EXISTS idx_books_ai_assistance_level
  ON public.books (ai_assistance_level)
  WHERE ai_assistance_level IS NOT NULL;
