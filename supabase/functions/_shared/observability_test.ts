import {
  buildAlertBody,
  type FinancialEventInput,
  shouldAlert,
} from "./observability.ts";

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function event(over: Partial<FinancialEventInput> = {}): FinancialEventInput {
  return { event_type: "webhook_received", ...over };
}

// ---------------------------------------------------------------------------
// Which events reach a human
// ---------------------------------------------------------------------------

Deno.test("critical and error events alert", () => {
  assertEquals(shouldAlert(event({ severity: "critical" })), true, "critical");
  assertEquals(shouldAlert(event({ severity: "error" })), true, "error");
});

Deno.test("routine events do not alert", () => {
  assertEquals(shouldAlert(event({ severity: "info" })), false, "info");
  assertEquals(shouldAlert(event({ severity: "warn" })), false, "warn");
  assertEquals(shouldAlert(event()), false, "severity omitted defaults to info");
});

Deno.test("a dead letter alerts whatever severity it carries", () => {
  // A dead letter means money work was abandoned. The emitters do not all mark
  // these critical — admin-refund-purchase dead-letters at "error", and a
  // future caller could use "info" — so severity alone is not enough.
  assertEquals(
    shouldAlert(event({ severity: "info", dead_letter_reason: "refund_ledger_write_failed" })),
    true,
    "info + dead letter",
  );
  assertEquals(
    shouldAlert(event({ severity: "warn", dead_letter_reason: "stripe_refund_call_failed" })),
    true,
    "warn + dead letter",
  );
});

Deno.test("the real critical emitters are covered", () => {
  // These are the event types stripe-webhook raises at critical severity.
  for (const t of ["webhook_signature_invalid", "webhook_claim_failed"]) {
    assertEquals(shouldAlert(event({ event_type: t, severity: "critical" })), true, t);
  }
});

// ---------------------------------------------------------------------------
// What the alert says
// ---------------------------------------------------------------------------

Deno.test("alert body carries the join keys for investigation", () => {
  const body = buildAlertBody(event({
    event_type: "webhook_signature_invalid",
    severity: "critical",
    actor: "webhook",
    correlation_id: "corr-123",
    stripe_event_id: "evt_456",
  }));

  assertEquals(body.severity, "critical", "severity");
  assertEquals(body.event_type, "webhook_signature_invalid", "event_type");
  assertEquals(body.actor, "webhook", "actor");
  assertEquals(body.correlation_id, "corr-123", "correlation_id");
  assertEquals(body.stripe_event_id, "evt_456", "stripe_event_id");
  assertEquals(
    body.text,
    "[ScrollLibrary] CRITICAL financial event: webhook_signature_invalid",
    "text",
  );
});

Deno.test("a dead letter reason is named in the alert text", () => {
  const body = buildAlertBody(event({
    event_type: "refund_failed",
    severity: "error",
    dead_letter_reason: "stripe_refund_call_failed",
  }));
  assertEquals(
    body.text,
    "[ScrollLibrary] ERROR financial event: refund_failed (dead-lettered: stripe_refund_call_failed)",
    "text",
  );
  assertEquals(body.dead_letter_reason, "stripe_refund_call_failed", "dead_letter_reason");
});

Deno.test("the raw event payload never leaves the system", () => {
  // payload can carry customer and Stripe object data. The alert is a pointer,
  // not a copy — investigation happens against financial_events by correlation
  // id. An outbound webhook is the wrong place for that data.
  const body = buildAlertBody(event({
    severity: "critical",
    correlation_id: "corr-789",
    payload: { email: "buyer@example.test", card_last4: "4242" },
  }));

  assertEquals("payload" in body, false, "payload key absent");
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes("buyer@example.test"), false, "no customer email");
  assertEquals(serialized.includes("4242"), false, "no card digits");
});

Deno.test("missing optional identifiers serialize as null, not undefined", () => {
  const body = buildAlertBody(event({ severity: "error" }));
  assertEquals(body.correlation_id, null, "correlation_id");
  assertEquals(body.stripe_event_id, null, "stripe_event_id");
  assertEquals(body.purchase_id, null, "purchase_id");
  assertEquals(body.dead_letter_reason, null, "dead_letter_reason");
  assertEquals(body.actor, "system", "actor defaults");
});
