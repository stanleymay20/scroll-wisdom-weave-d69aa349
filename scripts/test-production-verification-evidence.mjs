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
    ...base, paymentWritesDisabled: true, stripeLifecyclePassed: false,
  });
  assert.equal(report.result, "PRODUCTION_IDENTITY_AND_PUBLIC_SMOKE_PASS");
  assert.equal(report.paymentWrites, "disabled");
  assert.equal(report.commercialGaApproval, "NOT_ASSESSED");
  assert.equal(report.finalReleaseDecision, "REQUIRES_SEPARATE_OWNER_SIGNOFF");
  assert.ok(report.notCertifiedByThisWorkflow.includes("representative_real_book_kdp_previewer"));
  assert.ok(!JSON.stringify(report).includes("GA_PRODUCTION_VERIFICATION_PASS"));
});

test("passing Stripe lifecycle does not certify unrelated GA domains", () => {
  const report = buildProductionVerificationEvidence({
    ...base, paymentWritesDisabled: false, stripeLifecyclePassed: true,
  });
  assert.equal(report.paymentWrites, "enabled");
  assert.equal(report.stripeLifecycle, "success");
  assert.equal(report.commercialGaApproval, "NOT_ASSESSED");
  assert.ok(report.notCertifiedByThisWorkflow.includes("database_restore_and_release_rollback_rehearsals"));
});

test("open payments with failed or skipped Stripe lifecycle fail closed", () => {
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, paymentWritesDisabled: false, stripeLifecyclePassed: false,
  }), /exact-head Stripe lifecycle/);
});

test("missing/ambiguous release identity and gate states fail closed", () => {
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, paymentWritesDisabled: "false", stripeLifecyclePassed: true,
  }), /explicit boolean/);
  assert.throws(() => buildProductionVerificationEvidence({
    ...base, releaseSha: "", paymentWritesDisabled: true, stripeLifecyclePassed: false,
  }), /release identity/);
});
