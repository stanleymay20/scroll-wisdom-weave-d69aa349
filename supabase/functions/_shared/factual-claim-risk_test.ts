import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isHighRiskFactualSentence } from "./factual-claim-risk.ts";

Deno.test("company acquisition claims are high-risk factual claims", () => {
  assert(isHighRiskFactualSentence("Salesforce acquired Celonis at a rumored valuation above $11 billion."));
});

Deno.test("legal and regulatory thresholds are high-risk factual claims", () => {
  assert(isHighRiskFactualSentence("The EU Blue Card threshold is €50,700 in 2026."));
  assert(isHighRiskFactualSentence("The law requires a minimum share capital of €25,000."));
});

Deno.test("dated statistics and percentages are high-risk factual claims", () => {
  assert(isHighRiskFactualSentence("In 2025, 109,000 IT positions were unfilled."));
  assert(isHighRiskFactualSentence("Revenue increased by 18% year over year."));
});

Deno.test("ordinary non-factual author advice is not automatically high-risk", () => {
  assertEquals(isHighRiskFactualSentence("Talk to customers before scaling the sales team."), false);
});
