-- Compatibility bridge for the historical AdminOps entitlement migration.
--
-- creator_platform_connections has always used connection_status as its
-- canonical lifecycle field. A later historical AdminOps view referenced
-- cpc.status instead, which breaks clean migration replay before the later
-- publishing migrations are reached.
--
-- Keep connection_status as the single source of truth. The generated alias is
-- read-only and always reflects the canonical value, so legacy SQL can replay
-- without introducing divergent lifecycle state.

ALTER TABLE public.creator_platform_connections
  ADD COLUMN IF NOT EXISTS status text
  GENERATED ALWAYS AS (connection_status) STORED;

COMMENT ON COLUMN public.creator_platform_connections.status IS
  'Legacy read-only compatibility alias for connection_status; do not write directly.';
