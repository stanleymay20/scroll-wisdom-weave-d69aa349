
-- Add certification blockers and audit provenance columns
ALTER TABLE public.book_audits
ADD COLUMN IF NOT EXISTS certification_blockers text[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS audit_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS audit_prompt_version text NOT NULL DEFAULT 'v2.0';
