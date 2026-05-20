
-- Idempotency: Stripe session id must be unique when present
CREATE UNIQUE INDEX IF NOT EXISTS book_purchases_stripe_session_uidx
  ON public.book_purchases (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Prevent duplicate active 'paid' records per buyer per book
CREATE UNIQUE INDEX IF NOT EXISTS book_purchases_paid_unique_uidx
  ON public.book_purchases (buyer_user_id, book_id)
  WHERE status = 'paid' AND buyer_user_id IS NOT NULL;

-- Index to speed buyer/book lookups (used by user_owns_book_purchase)
CREATE INDEX IF NOT EXISTS book_purchases_buyer_book_status_idx
  ON public.book_purchases (buyer_user_id, book_id, status);
