import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { BillingPlanTier } from "./billing-plans.ts";
import {
  buildMaterialModelProvenance,
  floorSafeModelChain,
  getModelForPlan,
  getRewriteModelForPlan,
  mergeGenerationOutline,
  modelMeetsFloor,
  routeFloorModel,
  type GenerationRoute,
} from "./generation-model-floor.ts";

const PAID_PLANS: BillingPlanTier[] = ["student", "premium", "prophet_tier"];

Deno.test("routine generation keeps Free on Flash Lite and paid plans on Flash", () => {
  assertEquals(getModelForPlan("free"), "google/gemini-2.5-flash-lite");
  for (const plan of PAID_PLANS) {
    assertEquals(getModelForPlan(plan), "google/gemini-2.5-flash");
  }
});

Deno.test("Chief Editor keeps Free/Creator on Flash and Pro/Teams on Pro", () => {
  assertEquals(getRewriteModelForPlan("free"), "google/gemini-2.5-flash");
  assertEquals(getRewriteModelForPlan("student"), "google/gemini-2.5-flash");
  assertEquals(getRewriteModelForPlan("premium"), "google/gemini-2.5-pro");
  assertEquals(getRewriteModelForPlan("prophet_tier"), "google/gemini-2.5-pro");
});

Deno.test("floor-safe retry chains never downgrade the route", () => {
  const plans: BillingPlanTier[] = ["free", "student", "premium", "prophet_tier"];
  const routes: GenerationRoute[] = ["routine", "chief_editor"];

  for (const plan of plans) {
    for (const route of routes) {
      const floor = routeFloorModel(plan, route);
      const chain = floorSafeModelChain(plan, route);
      assertEquals(chain, [floor]);
      assert(chain.every((model) => modelMeetsFloor(model, floor)));
    }
  }
});

Deno.test("paid manuscript routes cannot include Flash Lite", () => {
  for (const plan of PAID_PLANS) {
    for (const route of ["routine", "chief_editor"] as const) {
      assertFalse(floorSafeModelChain(plan, route).includes("google/gemini-2.5-flash-lite"));
    }
  }
});

Deno.test("Pro and Teams Chief Editor cannot fall below Pro", () => {
  for (const plan of ["premium", "prophet_tier"] as const) {
    const chain = floorSafeModelChain(plan, "chief_editor");
    assertEquals(chain, ["google/gemini-2.5-pro"]);
    assert(chain.every((model) => modelMeetsFloor(model, "google/gemini-2.5-pro")));
  }
});

Deno.test("unknown models never satisfy a known floor", () => {
  assertFalse(modelMeetsFloor("unknown/provider-model", "google/gemini-2.5-flash"));
  assertFalse(modelMeetsFloor("google/gemini-2.5-flash", "unknown/provider-model"));
});

Deno.test("provenance records only accepted material stages and the final material model", () => {
  const provenance = buildMaterialModelProvenance({
    plan: "premium",
    route: "chief_editor",
    routeFloorModel: "google/gemini-2.5-pro",
    acceptedStages: [
      { stage: "generation", model: "google/gemini-2.5-pro" },
      { stage: "compression", model: "google/gemini-2.5-pro" },
    ],
    recordedAt: "2026-10-05T05:00:00.000Z",
  });

  assertEquals(provenance.finalMaterialModel, "google/gemini-2.5-pro");
  assertEquals(provenance.materialModelRoute, [
    { stage: "generation", model: "google/gemini-2.5-pro" },
    { stage: "compression", model: "google/gemini-2.5-pro" },
  ]);
  assertEquals(provenance.recordedAt, "2026-10-05T05:00:00.000Z");
});

Deno.test("generation_outline merge preserves existing worker metadata", () => {
  const provenance = buildMaterialModelProvenance({
    plan: "student",
    route: "routine",
    routeFloorModel: "google/gemini-2.5-flash",
    acceptedStages: [{ stage: "generation", model: "google/gemini-2.5-flash" }],
    recordedAt: "2026-10-05T05:00:00.000Z",
  });

  const merged = mergeGenerationOutline({
    description: "Existing outline description",
    keyTopics: ["one", "two"],
    futureField: { keep: true },
  }, provenance);

  assertEquals(merged.description, "Existing outline description");
  assertEquals(merged.keyTopics, ["one", "two"]);
  assertEquals(merged.futureField, { keep: true });
  assertEquals(merged.materialModelProvenance, provenance);
});

Deno.test("generation_outline merge safely handles null or non-object legacy values", () => {
  const provenance = buildMaterialModelProvenance({
    plan: "free",
    route: "routine",
    routeFloorModel: "google/gemini-2.5-flash-lite",
    acceptedStages: [{ stage: "generation", model: "google/gemini-2.5-flash-lite" }],
  });

  assertEquals(mergeGenerationOutline(null, provenance).materialModelProvenance, provenance);
  assertEquals(mergeGenerationOutline([], provenance).materialModelProvenance, provenance);
  assertEquals(mergeGenerationOutline("legacy", provenance).materialModelProvenance, provenance);
});
