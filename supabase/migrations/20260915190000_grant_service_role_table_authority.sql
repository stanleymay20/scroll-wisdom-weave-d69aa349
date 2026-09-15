-- Restore service_role's table authority across the public schema.
--
-- service_role is the trusted server identity: it is reachable only from Edge
-- Functions holding the secret key, it bypasses RLS by design, and every
-- hardening migration in this repository ends with the same pair —
--
--     REVOKE ALL ON TABLE public.x FROM PUBLIC, anon, authenticated;
--     GRANT ALL ON TABLE public.x TO service_role;
--
-- Tables that never received a hardening migration never received the second
-- half of that pair either. On a database built purely from this migration set,
-- 50 of 127 public tables grant service_role nothing at all, so a server path
-- touching one fails with 42501 rather than doing its job. No migration has
-- ever revoked anything from service_role, so this is omission, not policy.
--
-- What it broke: delete-account could not clear 16 of the tables it is
-- responsible for wiping, including learner_concept_states, learning_progress,
-- spaced_repetition_cards, study_notes, bookmarks, saved_decks,
-- assessment_integrity_logs and the knowledge-graph tables. The function is
-- fail-closed and correctly refused to report success, so account deletion
-- returned "could not safely remove all personal data" for every user. That is
-- the GDPR/CCPA erasure path, and it did not work.
--
-- The grant is schema-wide rather than a list of the 50, because a list is
-- exactly what rotted here: every table added since has had to remember a line
-- that is easy to omit and whose absence is invisible until a server path
-- happens to touch it at runtime. The default-privileges clause extends the
-- same authority to tables future migrations create, so the omission cannot
-- recur. This grants nothing to any browser-reachable role: anon and
-- authenticated are untouched, and RLS continues to govern them.
--
-- scripts/test-service-role-table-authority.sql asserts the invariant in CI.

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Migrations are applied as the `postgres` role, so the defaults must be
-- recorded for that role to apply to tables it creates later.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
