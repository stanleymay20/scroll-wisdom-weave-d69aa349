import {
  assessPrintPartnerQualification,
  chooseBestPrintQuote,
  shortlistPrintProviders,
  type PrintProviderProfile,
} from "./print-network.ts";

const providers: PrintProviderProfile[] = [
  {
    id: "global-pod",
    kind: "api_pod",
    qualification: "qualified",
    enabled: true,
    bindings: ["paperback", "hardcover"],
    destinationCountries: "*",
    minQuantity: 1,
    maxQuantity: 500,
    capabilities: ["black_white", "standard_color", "case_laminate"],
    liveQuote: true,
    blindShip: true,
    tracking: true,
    reliabilityBps: 9_850,
    priority: 10,
  },
  {
    id: "de-bulk-printer",
    kind: "regional_bulk",
    qualification: "qualified",
    enabled: true,
    bindings: ["paperback", "hardcover"],
    destinationCountries: ["DE", "AT", "NL", "BE"],
    minQuantity: 50,
    maxQuantity: 10_000,
    capabilities: ["black_white", "standard_color", "premium_color", "case_laminate"],
    liveQuote: false,
    blindShip: true,
    tracking: true,
    reliabilityBps: 9_900,
    priority: 20,
  },
  {
    id: "premium-specialist",
    kind: "premium_specialty",
    qualification: "qualified",
    enabled: true,
    bindings: ["hardcover"],
    destinationCountries: ["DE", "GB"],
    minQuantity: 1,
    maxQuantity: 1_000,
    capabilities: ["case_laminate", "dust_jacket", "foil", "ribbon", "printed_endpapers"],
    liveQuote: true,
    blindShip: true,
    tracking: true,
    reliabilityBps: 9_700,
  },
  {
    id: "distribution-network",
    kind: "distribution",
    qualification: "qualified",
    enabled: true,
    bindings: ["paperback", "hardcover"],
    destinationCountries: "*",
    minQuantity: 1,
    capabilities: ["black_white", "standard_color", "case_laminate", "dust_jacket"],
    liveQuote: false,
    blindShip: false,
    tracking: false,
    reliabilityBps: 9_800,
  },
  {
    id: "suspended-cheap-printer",
    kind: "regional_bulk",
    qualification: "suspended",
    enabled: true,
    bindings: ["paperback", "hardcover"],
    destinationCountries: ["DE"],
    minQuantity: 1,
    capabilities: ["black_white", "standard_color", "case_laminate"],
    liveQuote: true,
    blindShip: true,
    tracking: true,
    reliabilityBps: 10_000,
    priority: 100,
  },
];

Deno.test("single-copy author order prefers qualified API POD", () => {
  const result = shortlistPrintProviders(providers, {
    intent: "author_copy",
    binding: "paperback",
    quantity: 1,
    destinationCountry: "de",
    requiredCapabilities: ["black_white"],
  });
  if (result[0]?.providerId !== "global-pod") throw new Error("POD should lead a single-copy author order");
  if (result.some((item) => item.providerId === "suspended-cheap-printer")) throw new Error("suspended provider leaked into routing");
});

Deno.test("bulk author order considers regional printer before POD", () => {
  const result = shortlistPrintProviders(providers, {
    intent: "bulk_order",
    binding: "paperback",
    quantity: 250,
    destinationCountry: "DE",
    requiredCapabilities: ["standard_color"],
  });
  if (result[0]?.providerId !== "de-bulk-printer") throw new Error("qualified regional bulk printer should lead bulk routing");
  if (!result.some((item) => item.providerId === "global-pod")) throw new Error("POD should remain a quoteable fallback");
  if (result[0].quoteMode !== "manual") throw new Error("manual bulk quote mode should be explicit");
});

Deno.test("reader storefront refuses manual printers and distribution adapters", () => {
  const result = shortlistPrintProviders(providers, {
    intent: "reader_purchase",
    binding: "paperback",
    quantity: 1,
    destinationCountry: "DE",
  });
  if (result.length !== 1 || result[0].providerId !== "global-pod") {
    throw new Error(`reader checkout routing was not automation-safe: ${JSON.stringify(result)}`);
  }
});

Deno.test("premium capability routes to capable hardcover specialist", () => {
  const result = shortlistPrintProviders(providers, {
    intent: "author_copy",
    binding: "hardcover",
    quantity: 5,
    destinationCountry: "DE",
    requiredCapabilities: ["foil", "ribbon"],
  });
  if (result.length !== 1 || result[0].providerId !== "premium-specialist") {
    throw new Error("premium capability routing failed");
  }
});

Deno.test("distribution remains isolated from direct fulfillment", () => {
  const result = shortlistPrintProviders(providers, {
    intent: "distribution",
    binding: "hardcover",
    quantity: 1,
    destinationCountry: "US",
  });
  if (result.length !== 1 || result[0].providerId !== "distribution-network") {
    throw new Error("distribution adapter boundary failed");
  }
});

Deno.test("unsupported market fails closed with no fake provider", () => {
  const localOnly = providers.filter((provider) => provider.id === "de-bulk-printer");
  const result = shortlistPrintProviders(localOnly, {
    intent: "bulk_order",
    binding: "paperback",
    quantity: 100,
    destinationCountry: "GH",
  });
  if (result.length !== 0) throw new Error("unsupported destination should return no route");
});

Deno.test("best quote uses fresh landed cost after reliability floor", () => {
  const now = new Date("2026-10-09T19:00:00Z");
  const best = chooseBestPrintQuote([
    {
      providerId: "a",
      quoteId: "qa",
      currency: "EUR",
      landedTotalMinor: 1500,
      estimatedDeliveryDays: 6,
      reliabilityBps: 9_900,
      expiresAt: "2026-10-09T20:00:00Z",
    },
    {
      providerId: "b",
      quoteId: "qb",
      currency: "EUR",
      landedTotalMinor: 1400,
      estimatedDeliveryDays: 5,
      reliabilityBps: 9_400,
      expiresAt: "2026-10-09T20:00:00Z",
    },
    {
      providerId: "c",
      quoteId: "qc",
      currency: "EUR",
      landedTotalMinor: 1450,
      estimatedDeliveryDays: 8,
      reliabilityBps: 9_700,
      expiresAt: "2026-10-09T20:00:00Z",
    },
  ], {}, now);
  if (best?.providerId !== "c") throw new Error("unqualified cheap quote should not win");
});

Deno.test("expired quotes are ignored and delivery policy is enforced", () => {
  const now = new Date("2026-10-09T19:00:00Z");
  const best = chooseBestPrintQuote([
    {
      providerId: "expired",
      quoteId: "q1",
      currency: "EUR",
      landedTotalMinor: 1000,
      estimatedDeliveryDays: 2,
      reliabilityBps: 9_900,
      expiresAt: "2026-10-09T18:59:59Z",
    },
    {
      providerId: "slow",
      quoteId: "q2",
      currency: "EUR",
      landedTotalMinor: 1200,
      estimatedDeliveryDays: 12,
      reliabilityBps: 9_900,
      expiresAt: "2026-10-09T20:00:00Z",
    },
  ], { maximumDeliveryDays: 7 }, now);
  if (best !== null) throw new Error("expired/slow quotes should leave no eligible route");
});

Deno.test("quotes in different currencies are not compared without normalization", () => {
  let blocked = false;
  try {
    chooseBestPrintQuote([
      { providerId: "a", quoteId: "q1", currency: "EUR", landedTotalMinor: 1000, estimatedDeliveryDays: 5, reliabilityBps: 9_900, expiresAt: "2099-01-01T00:00:00Z" },
      { providerId: "b", quoteId: "q2", currency: "USD", landedTotalMinor: 900, estimatedDeliveryDays: 5, reliabilityBps: 9_900, expiresAt: "2099-01-01T00:00:00Z" },
    ]);
  } catch (error) {
    blocked = error instanceof Error && error.message === "PRINT_QUOTE_CURRENCY_MISMATCH";
  }
  if (!blocked) throw new Error("cross-currency quote comparison must fail closed");
});

Deno.test("local print partner qualification requires operational evidence", () => {
  const evidence = {
    sampleApproved: true,
    filePreflightValidated: true,
    packagingApproved: true,
    reprintPolicyConfirmed: true,
    privacyTermsConfirmed: true,
    piiLogRedactionConfirmed: true,
    turnaroundSlaConfirmed: true,
    trackingConfirmed: true,
    blindShipConfirmed: false,
  };
  const assessment = assessPrintPartnerQualification(evidence);
  if (assessment.qualified) throw new Error("partner missing blind-ship evidence was qualified");
  if (!assessment.blockers.includes("blind_ship_not_confirmed")) throw new Error("qualification blocker missing");

  const qualified = assessPrintPartnerQualification({ ...evidence, blindShipConfirmed: true });
  if (!qualified.qualified || qualified.blockers.length !== 0) throw new Error("complete partner evidence should qualify");
});
