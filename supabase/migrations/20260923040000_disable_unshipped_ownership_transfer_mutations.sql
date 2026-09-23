-- GA hardening: ownership transfer is not a shipped feature yet.
--
-- The legacy Edge workflow is intentionally disabled until transfer acceptance
-- is implemented as one database-atomic ownership transaction with a complete
-- recipient UX. Keep historical rows readable to transfer parties, but remove
-- browser mutation rights so ownership state cannot be staged or edited outside
-- a future server-owned authority.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.ownership_transfers
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS ownership_transfers_insert_owner
  ON public.ownership_transfers;

DROP POLICY IF EXISTS ownership_transfers_update_party
  ON public.ownership_transfers;

GRANT SELECT ON TABLE public.ownership_transfers TO authenticated;
GRANT ALL ON TABLE public.ownership_transfers TO service_role;
