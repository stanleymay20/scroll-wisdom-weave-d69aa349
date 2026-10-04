-- Durable one-time billing orders for usage packs and publishing services.
-- Payment never allocates an ISBN. Publishing service redemption happens later
-- inside the validated publication workflow.

CREATE TABLE IF NOT EXISTS public.billing_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('usage_addon','publishing_service')),
  sku text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  benefit_month text NOT NULL CHECK (benefit_month ~ '^\d{4}-\d{2}$'),
  expected_amount_cents integer NOT NULL CHECK (expected_amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_customer_id text,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_orders_user_created_idx
  ON public.billing_orders(user_id, created_at DESC);

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_orders FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_orders TO authenticated;
GRANT ALL ON TABLE public.billing_orders TO service_role;

DROP POLICY IF EXISTS "users read own billing orders" ON public.billing_orders;
CREATE POLICY "users read own billing orders"
  ON public.billing_orders
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
