
-- Add versioning columns to chapters for improvement rollback tracking
ALTER TABLE public.chapters
ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS previous_content text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS audit_id uuid DEFAULT NULL;

-- Add foreign key for audit_id
ALTER TABLE public.chapters
ADD CONSTRAINT chapters_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES public.book_audits(id) ON DELETE SET NULL;

-- Add index for audit lookups
CREATE INDEX IF NOT EXISTS idx_chapters_audit_id ON public.chapters(audit_id);

-- Add editorial quality gate columns to book_audits
ALTER TABLE public.book_audits
ADD COLUMN IF NOT EXISTS penalty_log jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS evidence_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS pre_penalty_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS certification_eligible boolean NOT NULL DEFAULT false;
