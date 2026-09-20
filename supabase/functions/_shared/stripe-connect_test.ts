import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canReceivePayouts,
  payoutMethodForStatus,
  payoutStatusFromAccount,
  payoutStatusMessage,
  type PayoutStatus,
  type StripeAccountSignals,
} from "./stripe-connect.ts";

const ALL: PayoutStatus[] = ["not_started", "pending", "verified", "restricted", "disabled"];

// ---------------------------------------------------------------------------
// The rule that matters: 'verified' is a promise that a person will be paid.
// ---------------------------------------------------------------------------

Deno.test("a fully onboarded account is verified", () => {
  assertEquals(
    payoutStatusFromAccount({
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: null, currently_due: [], past_due: [] },
    }),
    "verified",
  );
});

Deno.test("payouts enabled but something still due is not verified", () => {
  // Stripe will restrict this account when the deadline arrives. Telling the
  // creator they are fine until then is how a payout fails silently.
  assertEquals(
    payoutStatusFromAccount({
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: ["individual.verification.document"] },
    }),
    "restricted",
  );
});

Deno.test("a past-due requirement is restricted even while payouts still work", () => {
  assertEquals(
    payoutStatusFromAccount({
      payouts_enabled: true,
      details_submitted: true,
      requirements: { past_due: ["individual.id_number"] },
    }),
    "restricted",
  );
});

Deno.test("a disabled reason outranks payouts_enabled", () => {
  // Stripe can report both at once; the answer is never 'verified'.
  assertEquals(
    payoutStatusFromAccount({
      payouts_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: "requirements.past_due" },
    }),
    "restricted",
  );
});

Deno.test("a rejection is terminal, not merely restricted", () => {
  for (const reason of ["rejected.fraud", "rejected.terms_of_service", "rejected.other"]) {
    assertEquals(
      payoutStatusFromAccount({ payouts_enabled: false, requirements: { disabled_reason: reason } }),
      "disabled",
      reason,
    );
  }
});

Deno.test("a recoverable disabled reason is restricted, not disabled", () => {
  for (const reason of ["requirements.past_due", "requirements.pending_verification", "under_review"]) {
    assertEquals(
      payoutStatusFromAccount({ payouts_enabled: false, requirements: { disabled_reason: reason } }),
      "restricted",
      reason,
    );
  }
});

Deno.test("an untouched account is not_started", () => {
  assertEquals(payoutStatusFromAccount({}), "not_started");
  assertEquals(
    payoutStatusFromAccount({ payouts_enabled: false, details_submitted: false, requirements: {} }),
    "not_started",
  );
});

Deno.test("an account with work outstanding is not reported as untouched", () => {
  // details_submitted is false, but Stripe is asking for things — the creator
  // has started, and the page should say so.
  assertEquals(
    payoutStatusFromAccount({
      details_submitted: false,
      payouts_enabled: false,
      requirements: { currently_due: ["business_type"] },
    }),
    "pending",
  );
});

Deno.test("submitted but not yet enabled is pending", () => {
  assertEquals(
    payoutStatusFromAccount({
      details_submitted: true,
      payouts_enabled: false,
      requirements: { pending_verification: ["individual.verification.document"] },
    }),
    "pending",
  );
});

Deno.test("missing and malformed input never throws", () => {
  for (const input of [null, undefined, {}, { requirements: null }, { requirements: {} }]) {
    const status = payoutStatusFromAccount(input as StripeAccountSignals);
    assert(ALL.includes(status), `got ${status}`);
  }
  // Requirement lists arriving as something other than arrays must not crash.
  assertEquals(
    payoutStatusFromAccount({
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: "nope" as unknown as string[] },
    }),
    "verified",
  );
});

Deno.test("every result is one of the five states the column allows", () => {
  // The database has a CHECK constraint on stripe_connect_status; a sixth
  // value here would be a write that fails at runtime.
  const cases: StripeAccountSignals[] = [
    {},
    { payouts_enabled: true, details_submitted: true, requirements: {} },
    { payouts_enabled: false, details_submitted: true },
    { requirements: { disabled_reason: "rejected.fraud" } },
    { requirements: { past_due: ["x"] } },
    { requirements: { currently_due: ["x"] } },
  ];
  for (const input of cases) {
    assert(ALL.includes(payoutStatusFromAccount(input)), JSON.stringify(input));
  }
});

// ---------------------------------------------------------------------------
// canReceivePayouts
// ---------------------------------------------------------------------------

Deno.test("only verified means a creator can actually be paid", () => {
  for (const status of ALL) {
    assertEquals(canReceivePayouts(status), status === "verified", status);
  }
});

// ---------------------------------------------------------------------------
// Messaging — shown to the creator as-is.
// ---------------------------------------------------------------------------

Deno.test("every state has a message that says what to do", () => {
  for (const status of ALL) {
    const message = payoutStatusMessage(status);
    assert(message.length > 20, `${status}: "${message}"`);
    // Stripe's requirement identifiers are dotted internal strings such as
    // individual.verification.document; a creator should never be shown one.
    assert(
      !/\b[a-z_]+\.[a-z_]+/.test(message),
      `${status} message leaks an identifier: ${message}`,
    );
  }
});

Deno.test("the messages are distinct", () => {
  const seen = new Set(ALL.map(payoutStatusMessage));
  assertEquals(seen.size, ALL.length);
});

// ---------------------------------------------------------------------------
// payoutMethodForStatus
// ---------------------------------------------------------------------------

Deno.test("a half-finished onboarding does not present as a configured route", () => {
  assertEquals(payoutMethodForStatus("pending", "unset"), "unset");
  assertEquals(payoutMethodForStatus("not_started", "unset"), "unset");
  assertEquals(payoutMethodForStatus("restricted", "manual"), "manual");
});

Deno.test("verification switches the profile to stripe payouts", () => {
  assertEquals(payoutMethodForStatus("verified", "unset"), "stripe_connect");
  assertEquals(payoutMethodForStatus("verified", "manual"), "stripe_connect");
});

Deno.test("an already-connected creator is not silently moved off stripe", () => {
  // Losing verification is a problem to surface, not a reason to quietly
  // reroute someone's earnings to a manual process they never asked for.
  assertEquals(payoutMethodForStatus("restricted", "stripe_connect"), "stripe_connect");
  assertEquals(payoutMethodForStatus("disabled", "stripe_connect"), "stripe_connect");
});
