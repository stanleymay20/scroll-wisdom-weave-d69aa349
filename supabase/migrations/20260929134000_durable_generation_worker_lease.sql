-- Durable server-side chapter generation lease.
--
-- The browser must never be the generation engine. A worker invocation claims
-- one generation job for a bounded lease, generates at most one chapter, then
-- releases the lease and dispatches the next server continuation. If an Edge
-- instance dies, the lease expires and a later resume can safely continue.

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS worker_lease_token uuid,
  ADD COLUMN IF NOT EXISTS worker_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS worker_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS generation_jobs_worker_lease_idx
  ON public.generation_jobs(worker_lease_until)
  WHERE worker_lease_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_generation_job_step(
  _job_id uuid,
  _worker_token uuid,
  _lease_seconds integer DEFAULT 240
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.generation_jobs%ROWTYPE;
BEGIN
  IF _job_id IS NULL OR _worker_token IS NULL THEN
    RAISE EXCEPTION 'job_id_and_worker_token_required';
  END IF;
  IF _lease_seconds IS NULL OR _lease_seconds < 30 OR _lease_seconds > 600 THEN
    RAISE EXCEPTION 'invalid_worker_lease_seconds';
  END IF;

  SELECT * INTO _job
  FROM public.generation_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _job.status = 'completed' THEN
    RETURN false;
  END IF;

  IF _job.worker_lease_until IS NOT NULL
     AND _job.worker_lease_until > now()
     AND _job.worker_lease_token IS DISTINCT FROM _worker_token THEN
    RETURN false;
  END IF;

  UPDATE public.generation_jobs
  SET worker_lease_token = _worker_token,
      worker_lease_until = now() + make_interval(secs => _lease_seconds),
      worker_attempts = COALESCE(worker_attempts, 0) + 1,
      status = 'generating',
      completed_at = NULL,
      error_code = NULL,
      error_message = NULL
  WHERE id = _job_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_generation_job_step(
  _job_id uuid,
  _worker_token uuid,
  _current_chapter integer,
  _status text,
  _error_code text DEFAULT NULL,
  _error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('generating','partial','failed') THEN
    RAISE EXCEPTION 'invalid_generation_worker_status';
  END IF;

  UPDATE public.generation_jobs
  SET current_chapter = GREATEST(0, COALESCE(_current_chapter, 0)),
      status = _status,
      error_code = _error_code,
      error_message = CASE
        WHEN _error_message IS NULL THEN NULL
        ELSE left(_error_message, 1000)
      END,
      completed_at = CASE WHEN _status = 'failed' THEN now() ELSE NULL END,
      worker_lease_token = NULL,
      worker_lease_until = NULL
  WHERE id = _job_id
    AND worker_lease_token = _worker_token;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_generation_job_lease(
  _job_id uuid,
  _worker_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.generation_jobs
  SET worker_lease_token = NULL,
      worker_lease_until = NULL
  WHERE id = _job_id
    AND worker_lease_token = _worker_token;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_job_step(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_generation_job_step(uuid, uuid, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_generation_job_lease(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_generation_job_step(uuid, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_generation_job_step(uuid, uuid, integer, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_generation_job_lease(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.claim_generation_job_step(uuid, uuid, integer) IS
  'Atomically leases one generation job to one server worker. Expiring lease prevents duplicate chapter generation while remaining crash-recoverable.';
