-- Durable chapter generation intent for crash-recoverable server orchestration.
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS generation_outline jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chapters.generation_outline IS
  'Server-owned outline metadata (description/keyTopics) used to resume generation without scraping placeholder markdown.';
