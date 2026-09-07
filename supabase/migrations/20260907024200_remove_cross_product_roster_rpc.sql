-- ScrollLibrary repository boundary repair.
-- A shared lint-hardening migration accidentally retained a roster RPC from a
-- different product. That function is not part of ScrollLibrary and must not
-- exist in a freshly replayed ScrollLibrary schema.
DROP FUNCTION IF EXISTS public.provision_university_roster_batch(uuid, uuid, jsonb);
