CREATE OR REPLACE FUNCTION public.block_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'creator_earnings_ledger is append-only (op=%, id=%)', TG_OP, COALESCE(OLD.id::text, 'unknown');
END;
$$;