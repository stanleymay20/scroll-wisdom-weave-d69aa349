-- Add UNIQUE constraint for certificate idempotency
-- One certificate per user per book per type

-- First, create a unique index to enforce the rule
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_certificate_per_user_book_type 
ON public.publishing_certificates (user_id, book_id, certificate_type) 
WHERE revoked_at IS NULL;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_unique_certificate_per_user_book_type IS 
'Enforces Contract 6C: Only one active certificate per user per book per type. Revoked certificates are excluded.';