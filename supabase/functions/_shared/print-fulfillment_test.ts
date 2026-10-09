import {
  assertPrintArtifactIdentity,
  assertPrintOrderTransition,
  assertPrintQuoteFresh,
  canTransitionPrintOrder,
  isPrintOrderTerminal,
  isPrintQuoteExpired,
  requirePrintIdempotencyKey,
} from "./print-fulfillment.ts";

Deno.test("print order happy path is allowed", () => {
  const path = [
    "draft",
    "quoted",
    "payment_pending",
    "paid",
    "submission_pending",
    "submitted",
    "accepted_by_provider",
    "in_production",
    "shipped",
    "delivered",
  ] as const;

  for (let i = 0; i < path.length - 1; i++) {
    assertPrintOrderTransition(path[i], path[i + 1]);
  }
});

Deno.test("state replay is idempotent", () => {
  if (!canTransitionPrintOrder("submitted", "submitted")) {
    throw new Error("same-state provider replay should be idempotent");
  }
});

Deno.test("payment success cannot skip directly to production or shipped", () => {
  for (const forbidden of ["in_production", "shipped", "delivered"] as const) {
    let blocked = false;
    try {
      assertPrintOrderTransition("paid", forbidden);
    } catch (error) {
      blocked = error instanceof Error && error.message.includes("Invalid print-order transition");
    }
    if (!blocked) throw new Error(`paid -> ${forbidden} must fail closed`);
  }
});

Deno.test("provider rejection routes to refund or review, never shipment", () => {
  if (!canTransitionPrintOrder("provider_rejected", "refund_pending")) {
    throw new Error("provider rejection should allow refund recovery");
  }
  if (canTransitionPrintOrder("provider_rejected", "shipped")) {
    throw new Error("provider rejection must not become shipped");
  }
});

Deno.test("cancel request can race with production without lying about cancellation", () => {
  if (!canTransitionPrintOrder("cancel_pending", "in_production")) {
    throw new Error("provider may reject cancellation because production already started");
  }
  if (!canTransitionPrintOrder("cancel_pending", "cancelled")) {
    throw new Error("provider-approved cancellation should be representable");
  }
});

Deno.test("only delivered and refunded are terminal customer outcomes", () => {
  if (!isPrintOrderTerminal("delivered")) throw new Error("delivered should be terminal");
  if (!isPrintOrderTerminal("refunded")) throw new Error("refunded should be terminal");
  if (isPrintOrderTerminal("cancelled")) throw new Error("cancelled may still require a refund");
  if (isPrintOrderTerminal("provider_rejected")) throw new Error("rejected may still require a refund");
});

Deno.test("quote expires at or before the current instant", () => {
  const now = new Date("2026-10-09T19:00:00Z");
  if (!isPrintQuoteExpired({ expiresAt: "2026-10-09T19:00:00Z" }, now)) {
    throw new Error("quote expiring now should be expired");
  }
  if (isPrintQuoteExpired({ expiresAt: "2026-10-09T19:00:01Z" }, now)) {
    throw new Error("future quote should remain usable");
  }
});

Deno.test("malformed provider quote expiry fails closed", () => {
  if (!isPrintQuoteExpired({ expiresAt: "not-a-date" })) {
    throw new Error("malformed expiry must not be accepted");
  }

  let blocked = false;
  try {
    assertPrintQuoteFresh({ expiresAt: "not-a-date" });
  } catch (error) {
    blocked = error instanceof Error && error.message.includes("expired");
  }
  if (!blocked) throw new Error("malformed quote expiry did not block checkout");
});

Deno.test("stale artifact fingerprints block ordering", () => {
  const quoted = {
    publicationEditionId: "edition-1",
    interiorSha256: "AA11",
    coverSha256: "BB22",
  };

  assertPrintArtifactIdentity(quoted, {
    publicationEditionId: "edition-1",
    interiorSha256: "aa11",
    coverSha256: "bb22",
  });

  let blocked = false;
  try {
    assertPrintArtifactIdentity(quoted, {
      publicationEditionId: "edition-1",
      interiorSha256: "changed",
      coverSha256: "bb22",
    });
  } catch (error) {
    blocked = error instanceof Error && error.message.includes("artifact");
  }
  if (!blocked) throw new Error("changed interior artifact was accepted");
});

Deno.test("print idempotency key is mandatory and bounded", () => {
  const valid = "print:quote_123456:attempt_1";
  if (requirePrintIdempotencyKey(valid) !== valid) throw new Error("valid key changed");

  for (const bad of [null, "", "short", "contains spaces 123456789", "x".repeat(161)]) {
    let blocked = false;
    try {
      requirePrintIdempotencyKey(bad);
    } catch (error) {
      blocked = error instanceof Error && error.message === "PRINT_IDEMPOTENCY_KEY_REQUIRED";
    }
    if (!blocked) throw new Error(`bad idempotency key accepted: ${String(bad)}`);
  }
});
