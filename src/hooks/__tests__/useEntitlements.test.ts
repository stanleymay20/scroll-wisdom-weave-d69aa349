import { describe, expect, it } from "vitest";
import {
  hasFeatureAccess,
  hasPlanAccess,
  resolveEntitlements,
  type Entitlements,
} from "../../lib/entitlementAccess";

const student: Entitlements = {
  canPublish: true,
  canExport: true,
  canDownload: true,
  canGenerateBooks: true,
  canUseAllFormats: false,
  canExportAllFormats: false,
  hasCommercialRights: false,
  bypassAllLimits: false,
  canUseAiCovers: true,
  canUseTTS: true,
  canUseOpenAITTS: true,
  canUseElevenLabsTTS: false,
  canBatchGenerate: false,
  tier: "student",
  isAdmin: false,
  isProphet: false,
  isPremium: false,
  isStudent: true,
  // Compatibility alias must never override explicit capability flags.
  isScrollStudent: true,
  isPaid: true,
  isTrialMode: false,
};

function resolve(tier: Entitlements["tier"], overrides: Partial<Parameters<typeof resolveEntitlements>[0]> = {}) {
  return resolveEntitlements({
    tier,
    isAdmin: false,
    trialActive: false,
    stillLoading: false,
    ...overrides,
  });
}

describe("ScrollLibrary entitlement boundaries", () => {
  it("keeps explicitly enabled student capabilities available", () => {
    expect(hasFeatureAccess(student, "publish")).toBe(true);
    expect(hasFeatureAccess(student, "export")).toBe(true);
    expect(hasFeatureAccess(student, "tts")).toBe(true);
    expect(hasFeatureAccess(student, "aiCovers")).toBe(true);
  });

  it("does not convert paid or legacy student status into unrestricted access", () => {
    expect(hasFeatureAccess(student, "commercial")).toBe(false);
    expect(hasFeatureAccess(student, "allFormats")).toBe(false);
    expect(hasFeatureAccess(student, "elevenLabsTTS")).toBe(false);
    expect(hasFeatureAccess(student, "batch")).toBe(false);
  });

  it("does not let Student satisfy Premium or Institutional plan gates", () => {
    expect(hasPlanAccess(student, "student")).toBe(true);
    expect(hasPlanAccess(student, "premium")).toBe(false);
    expect(hasPlanAccess(student, "prophet_tier")).toBe(false);
  });

  it("lets Premium satisfy Student and Premium but not Institutional", () => {
    const premium = resolve("premium");
    expect(hasPlanAccess(premium, "student")).toBe(true);
    expect(hasPlanAccess(premium, "premium")).toBe(true);
    expect(hasPlanAccess(premium, "prophet_tier")).toBe(false);
  });

  it("keeps Institutional high-tier capabilities without unlimited bypass", () => {
    const institutional = resolve("prophet_tier");
    expect(institutional.isProphet).toBe(true);
    expect(institutional.canBatchGenerate).toBe(true);
    expect(institutional.canUseElevenLabsTTS).toBe(true);
    expect(institutional.bypassAllLimits).toBe(false);
    expect(hasPlanAccess(institutional, "prophet_tier")).toBe(true);
  });

  it("does not invent privileged roles for a full-access trial", () => {
    const trial = resolve("free", { trialActive: true });
    expect(trial.bypassAllLimits).toBe(true);
    expect(trial.isTrialMode).toBe(true);
    expect(trial.isAdmin).toBe(false);
    expect(trial.isProphet).toBe(false);
    expect(hasFeatureAccess(trial, "batch")).toBe(true);
    expect(hasPlanAccess(trial, "prophet_tier")).toBe(true);
  });

  it("still allows deliberate administrator override", () => {
    const admin = resolve("free", { isAdmin: true });
    expect(admin.isAdmin).toBe(true);
    expect(admin.bypassAllLimits).toBe(true);
    expect(hasFeatureAccess(admin, "batch")).toBe(true);
    expect(hasPlanAccess(admin, "prophet_tier")).toBe(true);
  });
});
