import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionVerificationEvidence } from "./production-verification-evidence.mjs";

const base = {
  verifiedAt: "2026-10-18T00:00:00Z",
  workflowRunId: "test-run",
  repository: "example/scrolllibrary",
  releaseSha: "f9b6369788212df252cbe53277d1aa8817b28f18",
  expectedSourceFingerprint: "fixture-fingerprint",
  production: { commit: null, commitSource: "unavailable", sourceFingerprint: "fixture-fingerprint" },
};

test("disabled payments permit only scoped production smoke evidence", () => {
  const report = buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: true, relatedCheckoutAndConnectDisabled: true, stripeLifecyclePassed: false,
  });
  assert.equal(report.result, "PRODUCTION_IDENTITY_AND_PUBLIC_SMOKE_PASS");
  assert.equal(report.subscriptionCheckoutWrites, "disabled");
  assert.equal(report.commercialGaApproval, "NOT_ASSESSED");
  assert.equal(report.broaderPaymentWriteContainment, "NOT_ASSESSED");
  assert.equal(report.finalReleaseDecision, "REQUIRES_SEPARATE_OWNER_SIGNOFF");
  assert.ok(report.notCertifiedByThisWorkflow.includes("representative_real_book_kdp_previewer"));
  assert.ok(!JSON.stringify(report).includes("GA_PRODUCTION_VERIFICATION_PASS"));
});

test("passing Stripe lifecycle does not certify unrelated GA domains", () => {
  const report = buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: false, relatedCheckoutAndConnectDisabled: false, stripeLifecyclePassed: true,
  });
  assert.equal(report.subscriptionCheckoutWrites, "enabled");
  assert.equal(report.stripeLifecycle, "success");
  assert.equal(report.commercialGaApproval, "NOT_ASSESSED");
  assert.ok(report.notCertifiedByThisWorkflow.includes("database_restore_and_release_rollback_rehearsals"));
});

test("open payments with failed or skipped Stripe lifecycle fail closed", () => {
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: false, relatedCheckoutAndConnectDisabled: false, stripeLifecyclePassed: false,
  }), /exact-head Stripe lifecycle/);
});

test("missing/ambiguous release identity and gate states fail closed", () => {
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: "false", stripeLifecyclePassed: true,
  }), /explicit boolean/);
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, releaseSha: "", subscriptionCheckoutDisabled: true, relatedCheckoutAndConnectDisabled: true, stripeLifecyclePassed: false,
  }), /release identity/);
});

test("subscription gate alone is not sufficient proof of all checkout entry points", () => {
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: true,
    relatedCheckoutAndConnectDisabled: false, stripeLifecyclePassed: false,
  }), /billing-order and Connect entry points/);
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, subscriptionCheckoutDisabled: true,
    stripeLifecyclePassed: false,
  }), /billing-order and Connect entry points/);
});
