-- Defense in depth for all future ScrollVision source adapters.
-- NOT VALID preserves historical rows for audit/cleanup, while PostgreSQL still
-- enforces the constraint for new or updated rows.

ALTER TABLE public.scrollvision_assets
  DROP CONSTRAINT IF EXISTS scrollvision_assets_publication_rights_minimum;

ALTER TABLE public.scrollvision_assets
  ADD CONSTRAINT scrollvision_assets_publication_rights_minimum
  CHECK (
    NULLIF(btrim(source), '') IS NOT NULL
    AND NULLIF(btrim(source_url), '') IS NOT NULL
    AND NULLIF(btrim(image_url), '') IS NOT NULL
    AND NULLIF(btrim(license), '') IS NOT NULL
    AND NULLIF(btrim(attribution), '') IS NOT NULL
    AND license !~* '(unknown|unspecified|all[[:space:]]+rights[[:space:]]+reserved|non[- ]?commercial|(^|[^a-z])nc([^a-z]|$)|no[- ]?derivatives|(^|[^a-z])nd([^a-z]|$))'
    AND license ~* '(public[[:space:]]+domain|public[[:space:]]+domain[[:space:]]+mark|(^|[^a-z])pdm([^a-z]|$)|cc[- _]?0|creative[[:space:]]+commons[[:space:]]+zero|cc[- _]+by|creative[[:space:]]+commons[[:space:]]+attribution)'
  ) NOT VALID;
