-- Add academic research metadata to chapters table
ALTER TABLE public.chapters 
ADD COLUMN IF NOT EXISTS academic_mode boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS citation_style text DEFAULT 'APA',
ADD COLUMN IF NOT EXISTS chapter_references jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS research_metadata jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.chapters.academic_mode IS 'Whether this chapter was generated in Academic Research Mode';
COMMENT ON COLUMN public.chapters.citation_style IS 'Citation style: APA, MLA, Harvard, Chicago';
COMMENT ON COLUMN public.chapters.chapter_references IS 'Array of verified references with author, title, year, type, doi, url';
COMMENT ON COLUMN public.chapters.research_metadata IS 'Research stats: source_count, source_types, confidence_score, research_date';