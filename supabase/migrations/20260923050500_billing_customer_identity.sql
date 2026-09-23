-- Canonical ScrollLibrary <-> Stripe billing-customer identity.
--
-- Email is contact data, not an ownership key. All subscription, portal,
-- storefront checkout and webhook reconciliation paths resolve through this
-- server-only one-user/one-customer mapping.

CREATE TABLE IF NOT EXISTS public.billing_customer_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  source text NOT NULL DEFAULT 'stripe'
    CHECK (pg_catalog.length(source) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customer_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_customer_links
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_customer_links TO service_role;

-- Existing Stripe authority is split between generation-plan subscriptions and
-- creator entitlements. Refuse convergence if those sources disagree.
DO $$
BEGIN
  IF EXISTS (
    WITH legacy AS (
      SELECT user_id, stripe_customer_id
      FROM public.subscriptions
      WHERE stripe_customer_id IS NOT NULL
      UNION ALL
      SELECT user_id, stripe_customer_id
      FROM public.creator_entitlements
      WHERE stripe_customer_id IS NOT NULL
    )
    SELECT 1
    FROM legacy
    GROUP BY user_id
    HAVING count(DISTINCT stripe_customer_id) > 1
  ) THEN
    RAISE EXCEPTION 'BILLING_CUSTOMER_ID_CONFLICT_FOR_USER'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH legacy AS (
      SELECT user_id, stripe_customer_id
      FROM public.subscriptions
      WHERE stripe_customer_id IS NOT NULL
      UNION ALL
      SELECT user_id, stripe_customer_id
      FROM public.creator_entitlements
      WHERE stripe_customer_id IS NOT NULL
    )
    SELECT 1
    FROM legacy
    GROUP BY stripe_customer_id
    HAVING count(DISTINCT user_id) > 1
  ) THEN
    RAISE EXCEPTION 'BILLING_CUSTOMER_SHARED_ACROSS_USERS'
      USING ERRCODE = '23514';
  END IF;
END
$$;

WITH legacy AS (
  SELECT user_id, stripe_customer_id
  FROM public.subscriptions
  WHERE stripe_customer_id IS NOT NULL
  UNION ALL
  SELECT user_id, stripe_customer_id
  FROM public.creator_entitlements
  WHERE stripe_customer_id IS NOT NULL
),
canonical AS (
  SELECT user_id, min(stripe_customer_id) AS stripe_customer_id
  FROM legacy
  GROUP BY user_id
)
INSERT INTO public.billing_customer_links(
  user_id, stripe_customer_id, source
)
SELECT user_id, stripe_customer_id, 'legacy_authority_backfill'
FROM canonical
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.billing_customer_links IS
  'Server-only canonical binding between a ScrollLibrary auth user and one Stripe Customer. Email must never be used as an ownership fallback.';
