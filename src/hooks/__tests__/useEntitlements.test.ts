import { describe, expect, it } from "vitest";
import { hasFeatureAccess, type Entitlements } from "../useEntitlements";

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

describe("ScrollLibrary student entitlement boundaries", () => {
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

  it("still allows deliberate administrator override", () => {
    expect(hasFeatureAccess({ ...student, isAdmin: true }, "batch")).toBe(true);
  });
});
