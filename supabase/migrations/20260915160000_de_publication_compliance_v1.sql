-- Germany publication-compliance declarations and controlled-release readiness.
--
-- This migration does NOT claim or certify legal compliance. It records publisher
-- declarations separately from system-verifiable facts so ScrollLibrary can show
-- a scoped "controlled-release ready" status without turning self-attestation into
-- legal verification.
--
-- System-verifiable facts (publication gates, ISBN assignment, distribution price)
-- remain in their authoritative tables. This table stores only declarations that
-- cannot be derived safely from the current data model.

CREATE TABLE IF NOT EXISTS public.publication_compliance_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL DEFAULT 'DE' CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  product_form text NOT NULL CHECK (product_form IN ('paperback', 'hardcover', 'epub')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',

  -- Scope declarations. These determine which rules the readiness engine evaluates.
  german_market_intended boolean NOT NULL DEFAULT true,
  commercial_release boolean NOT NULL DEFAULT true,
  publisher_state_code text CHECK (publisher_state_code IS NULL OR publisher_state_code ~ '^[A-Z]{2}$'),

  -- Publisher-accountability declarations. They are intentionally not named
  -- "verified" because ScrollLibrary has not independently established them.
  publisher_operating_basis_confirmed boolean NOT NULL DEFAULT false,
  imprint_notice_confirmed boolean NOT NULL DEFAULT false,
  dnb_deposit_plan_confirmed boolean NOT NULL DEFAULT false,
  state_deposit_plan_confirmed boolean NOT NULL DEFAULT false,

  -- Legal-deposit timing is tied to actual distribution/public-access start, not
  -- ScrollLibrary's internal publication timestamp. The latter may differ from the
  -- statutory trigger and must never be used as a silent substitute.
  distribution_started_at timestamptz,

  -- Post-release completion is tracked separately from the pre-release plan.
  dnb_deposit_completed_at timestamptz,
  state_deposit_completed_at timestamptz,
  deposit_evidence_reference text CHECK (
    deposit_evidence_reference IS NULL OR pg_catalog.length(deposit_evidence_reference) <= 1000
  ),

  -- Direct-sale and packaging responsibility are conditional.
  direct_sales_enabled boolean NOT NULL DEFAULT false,
  direct_sales_legal_notice_confirmed boolean NOT NULL DEFAULT false,
  packaging_responsibility text NOT NULL DEFAULT 'not_applicable'
    CHECK (packaging_responsibility IN ('not_applicable', 'third_party_confirmed', 'publisher_responsible')),
  lucid_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (lucid_status IN ('not_applicable', 'registered', 'required_missing')),

  notes text CHECK (notes IS NULL OR pg_catalog.length(notes) <= 4000),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT publication_compliance_identity_uq
    UNIQUE (book_id, jurisdiction, product_form, language, edition_label),
  CONSTRAINT publication_compliance_lucid_shape CHECK (
    (packaging_responsibility = 'publisher_responsible' AND lucid_status IN ('registered', 'required_missing'))
    OR (packaging_responsibility <> 'publisher_responsible' AND lucid_status = 'not_applicable')
  ),
  CONSTRAINT publication_compliance_direct_sales_shape CHECK (
    direct_sales_enabled OR direct_sales_legal_notice_confirmed = false
  )
);

CREATE INDEX IF NOT EXISTS publication_compliance_book_idx
  ON public.publication_compliance_declarations(book_id, product_form, jurisdiction);

ALTER TABLE public.publication_compliance_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_compliance_declarations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.publication_compliance_declarations TO authenticated;
GRANT ALL ON TABLE public.publication_compliance_declarations TO service_role;

DROP POLICY IF EXISTS publication_compliance_owner_read ON public.publication_compliance_declarations;
CREATE POLICY publication_compliance_owner_read
  ON public.publication_compliance_declarations
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = publication_compliance_declarations.book_id
        AND (b.user_id = (SELECT auth.uid()) OR b.creator_id = (SELECT auth.uid()))
    )
  );

DO $$ BEGIN
  CREATE TRIGGER trg_publication_compliance_updated_at
  BEFORE UPDATE ON public.publication_compliance_declarations
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Distribution start and completed-deposit timestamps are audit facts. Normal
-- declaration saves must not erase a fact simply because an older UI omits it or
-- a checkbox is toggled off later. Corrections require an explicit future audit
-- workflow rather than silent deletion.
CREATE OR REPLACE FUNCTION public.preserve_publication_compliance_audit_facts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.distribution_started_at IS NOT NULL AND NEW.distribution_started_at IS NULL THEN
    NEW.distribution_started_at := OLD.distribution_started_at;
  END IF;
  IF OLD.dnb_deposit_completed_at IS NOT NULL AND NEW.dnb_deposit_completed_at IS NULL THEN
    NEW.dnb_deposit_completed_at := OLD.dnb_deposit_completed_at;
  END IF;
  IF OLD.state_deposit_completed_at IS NOT NULL AND NEW.state_deposit_completed_at IS NULL THEN
    NEW.state_deposit_completed_at := OLD.state_deposit_completed_at;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_preserve_publication_compliance_audit_facts
  BEFORE UPDATE ON public.publication_compliance_declarations
  FOR EACH ROW EXECUTE FUNCTION public.preserve_publication_compliance_audit_facts();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Browser roles cannot manufacture compliance declarations. Writes go through the
-- authenticated Edge Function, which verifies ownership and uses the service role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.publication_compliance_declarations
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.publication_compliance_declarations IS
  'Publisher declarations used by the jurisdiction-specific controlled-release readiness engine. These rows are not legal certifications.';
