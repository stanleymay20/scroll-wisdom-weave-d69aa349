-- Reconcile the two historical entitlement-snapshot shapes before the
-- AdminOps entitlement-console migration runs.
--
-- An earlier migration created creator_entitlement_snapshots with a canonical
-- capabilities JSON document, UUID context_id, and captured_at timestamp.  The
-- following AdminOps migration was written as though it were creating the table
-- for the first time and expects direct capability columns, a text context_id,
-- metadata, and created_at.  CREATE TABLE IF NOT EXISTS does not add missing
-- columns, so clean migration replay otherwise fails when it indexes created_at.
--
-- This migration is additive except for widening context_id from uuid to text.
-- UUID values remain losslessly representable as text, while the later admin
-- console legitimately stores non-UUID context keys as well.

ALTER TABLE public.creator_entitlement_snapshots
  ALTER COLUMN context_id TYPE text USING context_id::text;

ALTER TABLE public.creator_entitlement_snapshots
  ADD COLUMN IF NOT EXISTS can_publish_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_schedule_releases boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_use_collections_unlimited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_generation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_generation_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_until timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Preserve the historical capability state in the newly materialized columns
-- instead of silently replacing it with column defaults.
UPDATE public.creator_entitlement_snapshots
SET
  can_publish_external = COALESCE(
    CASE
      WHEN capabilities ? 'can_publish_external'
        AND lower(capabilities ->> 'can_publish_external') IN ('true','false')
      THEN (capabilities ->> 'can_publish_external')::boolean
      ELSE NULL
    END,
    can_publish_external
  ),
  can_schedule_releases = COALESCE(
    CASE
      WHEN capabilities ? 'can_schedule_releases'
        AND lower(capabilities ->> 'can_schedule_releases') IN ('true','false')
      THEN (capabilities ->> 'can_schedule_releases')::boolean
      ELSE NULL
    END,
    can_schedule_releases
  ),
  can_use_collections_unlimited = COALESCE(
    CASE
      WHEN capabilities ? 'can_use_collections_unlimited'
        AND lower(capabilities ->> 'can_use_collections_unlimited') IN ('true','false')
      THEN (capabilities ->> 'can_use_collections_unlimited')::boolean
      ELSE NULL
    END,
    can_use_collections_unlimited
  ),
  priority_generation = COALESCE(
    CASE
      WHEN capabilities ? 'priority_generation'
        AND lower(capabilities ->> 'priority_generation') IN ('true','false')
      THEN (capabilities ->> 'priority_generation')::boolean
      ELSE NULL
    END,
    priority_generation
  ),
  monthly_generation_bonus = COALESCE(
    CASE
      WHEN COALESCE(capabilities ->> 'monthly_generation_bonus', '') ~ '^-?[0-9]+$'
      THEN (capabilities ->> 'monthly_generation_bonus')::integer
      ELSE NULL
    END,
    monthly_generation_bonus
  ),
  created_at = COALESCE(captured_at, created_at);

CREATE INDEX IF NOT EXISTS idx_entitlement_snapshots_user_time
  ON public.creator_entitlement_snapshots(user_id, created_at DESC);
