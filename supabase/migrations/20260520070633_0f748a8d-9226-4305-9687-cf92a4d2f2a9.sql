
-- book_purchases: one row per successful (or in-flight) one-off purchase
CREATE TABLE public.book_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.public_listings(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  buyer_user_id UUID, -- nullable: guest checkout
  buyer_email TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed')),
  purchased_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.book_purchases ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_book_purchases_buyer ON public.book_purchases(buyer_user_id, status);
CREATE INDEX idx_book_purchases_listing ON public.book_purchases(listing_id);
CREATE INDEX idx_book_purchases_book_paid ON public.book_purchases(book_id) WHERE status = 'paid';

CREATE TRIGGER update_book_purchases_updated_at
  BEFORE UPDATE ON public.book_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SELECT: buyer, book owner, or admin
CREATE POLICY "Buyers can view own purchases"
  ON public.book_purchases FOR SELECT
  USING (buyer_user_id = auth.uid());

CREATE POLICY "Book owners can view purchases of their books"
  ON public.book_purchases FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_purchases.book_id AND b.user_id = auth.uid()));

CREATE POLICY "Admins can view all purchases"
  ON public.book_purchases FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- No client INSERT/UPDATE/DELETE policies — only service role (webhook) writes.

-- SECURITY DEFINER helper: does the calling user have a paid purchase for this book?
CREATE OR REPLACE FUNCTION public.user_owns_book_purchase(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.book_purchases
    WHERE buyer_user_id = _user_id
      AND book_id = _book_id
      AND status = 'paid'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.user_owns_book_purchase(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_owns_book_purchase(uuid, uuid) TO authenticated;

-- Extend chapters RLS: paid buyers can read every chapter of their purchased book
CREATE POLICY "Buyers can read full chapters of purchased books"
  ON public.chapters FOR SELECT
  USING (public.user_owns_book_purchase(auth.uid(), book_id));

-- Extend books RLS: paid buyers can read the book record
CREATE POLICY "Buyers can read purchased books"
  ON public.books FOR SELECT
  USING (public.user_owns_book_purchase(auth.uid(), id));
