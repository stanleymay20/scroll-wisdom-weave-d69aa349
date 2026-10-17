/**
 * Narrow production smoke evidence. Passing these tests never constitutes
 * commercial-GA approval: hosted schema, operational recovery, content quality,
 * specialized publication, and owner signoff have separate acceptance gates.
 */
export function buildProductionVerificationEvidence({
  verifiedAt,
  workflowRunId,
  repository,
  releaseSha,
  expectedSourceFingerprint,
  production,
  paymentWritesDisabled,
  stripeLifecyclePassed,
}) {
  if (!releaseSha || !expectedSourceFingerprint || !production || !repository) {
    throw new Error("Missing release identity for production verification evidence");
  }
  if (typeof paymentWritesDisabled !== "boolean" || typeof stripeLifecyclePassed !== "boolean") {
    throw new Error("Commercial gate evidence must use explicit boolean states");
  }
  if (!paymentWritesDisabled && !stripeLifecyclePassed) {
    throw new Error("Payment writes are open but the exact-head Stripe lifecycle has not passed");
  }

  return {
    schemaVersion: 2,
    verifiedAt,
    workflowRunId,
    repository,
    releaseSha,
    expectedSourceFingerprint,
    production,
    paymentWrites: paymentWritesDisabled ? "disabled" : "enabled",
    stripeLifecycle: paymentWritesDisabled ? "not_required_for_disabled_payment_probe" : "success",
    verifiedScope: [
      "hosted_release_source_identity",
      "required_exact_head_workflow_results",
      "subscription_checkout_gate_probe",
      "public_route_http_smoke",
    ],
    // These are not evaluated by this workflow, even when another pipeline
    // has evidence. Each needs its own current-head/hosted acceptance record.
    notCertifiedByThisWorkflow: [
      "lovable_hosted_schema_convergence",
      "authenticated_and_rls_production_journeys",
      "five_full_book_human_quality_campaign",
      "representative_real_book_kdp_previewer",
      "database_restore_and_release_rollback_rehearsals",
      "legal_and_business_approval",
      "teams_publishing_services_and_marketplace_payouts",
    ],
    result: "PRODUCTION_IDENTITY_AND_PUBLIC_SMOKE_PASS",
    commercialGaApproval: "NOT_ASSESSED",
    finalReleaseDecision: "REQUIRES_SEPARATE_OWNER_SIGNOFF",
  };
}
