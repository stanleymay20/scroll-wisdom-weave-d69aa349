import type { BillingPlanTier } from "./billing-plans.ts";

export type GenerationRoute = "routine" | "chief_editor";
export type MaterialModelStage = "generation" | "stress_test" | "compression";

export interface MaterialModelStageRecord {
  stage: MaterialModelStage;
  model: string;
}

export interface MaterialModelProvenance {
  version: "v1";
  plan: BillingPlanTier;
  route: GenerationRoute;
  routeFloorModel: string;
  materialModelRoute: MaterialModelStageRecord[];
  finalMaterialModel: string;
  recordedAt: string;
}

const MODEL_RANK: Readonly<Record<string, number>> = Object.freeze({
  "google/gemini-2.5-flash-lite": 1,
  "google/gemini-2.5-flash": 2,
  "google/gemini-2.5-pro": 3,
});

export function getModelForPlan(plan: BillingPlanTier): string {
  return plan === "free"
    ? "google/gemini-2.5-flash-lite"
    : "google/gemini-2.5-flash";
}

export function getRewriteModelForPlan(plan: BillingPlanTier): string {
  return plan === "premium" || plan === "prophet_tier"
    ? "google/gemini-2.5-pro"
    : "google/gemini-2.5-flash";
}

export function routeFloorModel(plan: BillingPlanTier, route: GenerationRoute): string {
  return route === "chief_editor" ? getRewriteModelForPlan(plan) : getModelForPlan(plan);
}

/**
 * No lower-quality fallback is currently qualified for manuscript generation.
 * Transient retries therefore stay on the route floor and fail honestly after
 * the caller's existing retry budget is exhausted.
 */
export function floorSafeModelChain(plan: BillingPlanTier, route: GenerationRoute): readonly string[] {
  return Object.freeze([routeFloorModel(plan, route)]);
}

export function modelMeetsFloor(model: string, floor: string): boolean {
  const modelRank = MODEL_RANK[model];
  const floorRank = MODEL_RANK[floor];
  return typeof modelRank === "number" && typeof floorRank === "number" && modelRank >= floorRank;
}

export function buildMaterialModelProvenance(args: {
  plan: BillingPlanTier;
  route: GenerationRoute;
  routeFloorModel: string;
  acceptedStages: readonly MaterialModelStageRecord[];
  recordedAt?: string;
}): MaterialModelProvenance {
  const materialModelRoute = args.acceptedStages.map((stage) => ({ ...stage }));
  const finalMaterialModel = materialModelRoute.length > 0
    ? materialModelRoute[materialModelRoute.length - 1].model
    : args.routeFloorModel;

  return {
    version: "v1",
    plan: args.plan,
    route: args.route,
    routeFloorModel: args.routeFloorModel,
    materialModelRoute,
    finalMaterialModel,
    recordedAt: args.recordedAt ?? new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeGenerationOutline(
  existing: unknown,
  provenance: MaterialModelProvenance,
): Record<string, unknown> {
  return {
    ...(isRecord(existing) ? existing : {}),
    materialModelProvenance: provenance,
  };
}
