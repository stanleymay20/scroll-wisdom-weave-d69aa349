
CREATE INDEX IF NOT EXISTS idx_attribution_converted_purchase
  ON public.attribution_sessions(converted_purchase_id)
  WHERE converted_purchase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attribution_source_medium_campaign
  ON public.attribution_sessions(first_touch_source, first_touch_medium, first_touch_campaign);

CREATE INDEX IF NOT EXISTS idx_earnings_purchase_creator_entry
  ON public.creator_earnings_ledger(purchase_id, creator_user_id, entry_type);
