-- ============================================================================
-- Publishing pipeline enterprise hardening
-- ----------------------------------------------------------------------------
-- 1) Expand publishing_audit_log event_type CHECK to cover the full connection
--    lifecycle (connect, disconnect, upstream revoke, decrypt failure, retry,
--    validation failure). Without these, the edge functions silently drop
--    audit rows that violate the CHECK and operators lose forensic visibility.
-- 2) Add correlation_id columns to external_publications and
--    publishing_audit_log so a single user-facing support ID can stitch the
--    edge function, audit log, and external publication row together.
-- 3) Track explicit revocation/disconnection timestamps on
--    creator_platform_connections so dashboards can reason about
--    "needs_reauth" windows without inferring from last_error strings.
-- 4) Materialise a cleanup function for expired oauth_states so the table
--    cannot grow unbounded.
-- 5) Operator RPC for pipeline health: stuck pending publishes, failed
--    connection counts, dead-lettered events.
-- ============================================================================

-- 1) Expand publishing_audit_log event types ----------------------------------
ALTER TABLE public.publishing_audit_log
  DROP CONSTRAINT IF EXISTS publishing_audit_log_event_type_check;

ALTER TABLE public.publishing_audit_log
  ADD CONSTRAINT publishing_audit_log_event_type_check
  CHECK (event_type IN (
    'publish_started','publish_completed','publish_failed','publish_retried',
    'publish_validation_failed',
    'sync_started','sync_completed','sync_failed',
    'token_revoked','token_expired',
    'external_updated','external_deleted','external_unpublished',
    'publish_blocked_by_tier',
    'entitlement_granted','entitlement_revoked','entitlement_overridden','entitlement_resynced',
    'admin_manual_upgrade','admin_manual_downgrade',
    'connection_started','connection_completed','connection_failed',
    'connection_disconnected','connection_revoked_upstream',
    'connection_decrypt_failed','connection_status_changed'
  ));

-- 2) Correlation IDs for cross-system traceability ---------------------------
ALTER TABLE public.publishing_audit_log
  ADD COLUMN IF NOT EXISTS correlation_id text;

ALTER TABLE public.external_publications
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS last_publish_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pub_audit_correlation
  ON public.publishing_audit_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_pub_correlation
  ON public.external_publications (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Severity is currently info/warning/error; "critical" is the standard fourth
-- level used elsewhere (financial_events). Align so publishing alerts can fan
-- into the same paging path.
ALTER TABLE public.publishing_audit_log
  DROP CONSTRAINT IF EXISTS publishing_audit_log_severity_check;
ALTER TABLE public.publishing_audit_log
  ADD CONSTRAINT publishing_audit_log_severity_check
  CHECK (severity IN ('info','warning','error','critical'));

-- Operator queries: "show me everything that failed on shopify in the last hour"
CREATE INDEX IF NOT EXISTS idx_pub_audit_platform_severity
  ON public.publishing_audit_log (platform, severity, created_at DESC);

-- 3) Connection lifecycle bookkeeping ----------------------------------------
ALTER TABLE public.creator_platform_connections
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cpc_platform_status
  ON public.creator_platform_connections (platform, connection_status);

-- 4) oauth_states retention --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  DELETE FROM public.oauth_states
  WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_oauth_states() FROM PUBLIC, anon, authenticated;

-- 5) Pipeline health snapshot (admin-only) -----------------------------------
-- Surfaces the "is the publishing pipeline broken right now?" question with
-- one query: stuck pending rows, failed publishes in window, broken
-- connections, oauth state backlog.
CREATE OR REPLACE FUNCTION public.get_publishing_pipeline_health(
  _window_minutes integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  WITH window_audit AS (
    SELECT platform,
           COUNT(*) FILTER (WHERE event_type = 'publish_started')::bigint   AS started,
           COUNT(*) FILTER (WHERE event_type = 'publish_completed')::bigint AS completed,
           COUNT(*) FILTER (WHERE event_type = 'publish_failed')::bigint    AS failed,
           COUNT(*) FILTER (WHERE event_type = 'publish_retried')::bigint   AS retried,
           COUNT(*) FILTER (WHERE event_type = 'publish_blocked_by_tier')::bigint AS blocked_by_tier,
           COUNT(*) FILTER (WHERE event_type = 'token_expired')::bigint     AS token_expired,
           COUNT(*) FILTER (WHERE severity IN ('error','critical'))::bigint AS errors
    FROM public.publishing_audit_log
    WHERE created_at >= now() - make_interval(mins => _window_minutes)
    GROUP BY platform
  ),
  conns AS (
    SELECT platform,
           COUNT(*) FILTER (WHERE connection_status = 'connected')::bigint AS connected,
           COUNT(*) FILTER (WHERE connection_status = 'expired')::bigint   AS expired,
           COUNT(*) FILTER (WHERE connection_status = 'revoked')::bigint   AS revoked,
           COUNT(*) FILTER (WHERE connection_status = 'error')::bigint     AS errored,
           COUNT(*) FILTER (WHERE consecutive_failures >= 3)::bigint        AS persistently_failing
    FROM public.creator_platform_connections
    GROUP BY platform
  ),
  stuck AS (
    SELECT platform,
           COUNT(*)::bigint AS stuck_pending
    FROM public.external_publications
    WHERE status = 'pending'
      AND COALESCE(last_publish_attempt_at, updated_at) < now() - interval '10 minutes'
    GROUP BY platform
  ),
  oauth_backlog AS (
    SELECT COUNT(*)::bigint AS expired_states
    FROM public.oauth_states
    WHERE expires_at < now()
  )
  SELECT jsonb_build_object(
    'window_minutes', _window_minutes,
    'generated_at',   now(),
    'oauth_state_backlog', (SELECT expired_states FROM oauth_backlog),
    'platforms', COALESCE((
      SELECT jsonb_object_agg(p.platform, jsonb_build_object(
        'audit',     to_jsonb(w),
        'conns',     to_jsonb(c),
        'stuck_pending', COALESCE(s.stuck_pending, 0)
      ))
      FROM (
        SELECT DISTINCT platform FROM (
          SELECT platform FROM window_audit
          UNION ALL SELECT platform FROM conns
          UNION ALL SELECT platform FROM stuck
        ) u WHERE platform IS NOT NULL
      ) p
      LEFT JOIN window_audit w ON w.platform = p.platform
      LEFT JOIN conns       c ON c.platform = p.platform
      LEFT JOIN stuck       s ON s.platform = p.platform
    ), '{}'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_publishing_pipeline_health(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_publishing_pipeline_health(integer) TO authenticated;

-- 6) Helper to atomically record success/failure on a connection from edge
--    functions. Keeps consecutive_failures counter authoritative on the DB.
CREATE OR REPLACE FUNCTION public.record_platform_connection_outcome(
  _user_id uuid,
  _platform text,
  _success boolean,
  _error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _success THEN
    UPDATE public.creator_platform_connections
       SET last_success_at = now(),
           last_used_at    = now(),
           consecutive_failures = 0,
           last_error      = NULL
     WHERE user_id = _user_id AND platform = _platform;
  ELSE
    UPDATE public.creator_platform_connections
       SET consecutive_failures = consecutive_failures + 1,
           last_used_at    = now(),
           last_error      = LEFT(COALESCE(_error, last_error), 400)
     WHERE user_id = _user_id AND platform = _platform;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_platform_connection_outcome(uuid, text, boolean, text)
  FROM PUBLIC, anon, authenticated;
