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
  subscriptionCheckoutDisabled,
  relatedCheckoutAndConnectDisabled,
  stripeLifecyclePassed,
}) {
  if (!releaseSha || !expectedSourceFingerprint || !production || !repository) {
    throw new Error("Missing release identity for production verification evidence");
  }
  if (typeof subscriptionCheckoutDisabled !== "boolean" || typeof stripeLifecyclePassed !== "boolean") {
    throw new Error("Commercial gate evidence must use explicit boolean states");
  }
  if (subscriptionCheckoutDisabled && relatedCheckoutAndConnectDisabled !== true) {
    throw new Error("Disabled subscription checkout does not prove billing-order and Connect entry points are closed");
  }
  if (!subscriptionCheckoutDisabled && !stripeLifecyclePassed) {
    throw new Error("Subscription checkout is open but the exact-head Stripe lifecycle has not passed");
  }

  return {
    schemaVersion: 3,
    verifiedAt,
    workflowRunId,
    repository,
    releaseSha,
    expectedSourceFingerprint,
    production,
    subscriptionCheckoutWrites: subscriptionCheckoutDisabled ? "disabled" : "enabled",
    billingOrderAndConnectEntryPoints: subscriptionCheckoutDisabled ? "confirmed_disabled" : "not_assessed",
    // Administrative refunds, customer portal, marketplace sales, payout
    // transfers and already-created Stripe objects are outside these probes.
    broaderPaymentWriteContainment: "NOT_ASSESSED",
    stripeLifecycle: subscriptionCheckoutDisabled ? "not_required_for_disabled_checkout_probes" : "success",
    verifiedScope: [
      "hosted_release_source_identity",
      "required_exact_head_workflow_results",
      "subscription_checkout_gate_probe",
      ...(subscriptionCheckoutDisabled ? [
        "billing_order_checkout_gate_probe",
        "stripe_connect_onboarding_gate_probe",
      ] : []),
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
