// Locks the per-platform sell-safety contract.
// Each failure here means a book that should have been blocked from a
// selling platform would instead ship and trigger upstream removal.
import { describe, it, expect } from "vitest";
import {
  auditSellSafety, auditAllPlatforms, type SellSafetyInput,
} from "../../../supabase/functions/_shared/sell-safety";

const clean: SellSafetyInput = {
  book: { title: "A Quiet Book", description: "A short novel.", category: "Fiction" },
  listing: {
    blurb: "A taut, atmospheric story.",
    amazon_description: "A 220-character description that comfortably exceeds the 150-character publisher floor. Includes hooks for the storefront card and enough body text to feel like a real product page.",
    price_cents: 999, currency: "USD", seo_keywords: ["fiction", "novel"],
  },
  chaptersFullText: "She walked into the room. The light was soft. Someone had left a window open.",
  aiAssistanceLevel: "assisted",
  cover: { widthPx: 2560, heightPx: 1600, mime: "image/jpeg" },
};

describe("auditSellSafety — clean book", () => {
  it("is safe on every platform", () => {
    for (const platform of ["kdp", "gumroad", "shopify", "substack", "patreon", "etsy"] as const) {
      const r = auditSellSafety(clean, platform);
      expect(r.verdict, `${platform} ${r.summary}`).not.toBe("unsafe");
    }
  });
});

describe("auditSellSafety — universal blockers", () => {
  it("hate-speech incitement is unsafe everywhere", () => {
    const input = { ...clean, chaptersFullText: "We must kill all the muslims in this town. " };
    for (const platform of ["kdp", "gumroad", "shopify", "etsy", "substack", "patreon"] as const) {
      const r = auditSellSafety(input, platform);
      expect(r.verdict).toBe("unsafe");
      expect(r.issues.some((i) => i.code === "hate_target_group")).toBe(true);
    }
  });

  it("weapon-construction instructions are unsafe everywhere", () => {
    const input = { ...clean, chaptersFullText: "Here is how to build a nuclear device step by step." };
    const r = auditSellSafety(input, "gumroad");
    expect(r.verdict).toBe("unsafe");
  });

  it("self-harm instructions are unsafe everywhere", () => {
    // The pattern matches instruction phrasing ("how to kill yourself"), not
    // a depiction. That's deliberate — we don't want to refuse literary work
    // about suicidal ideation, only step-by-step instruction.
    const input = { ...clean, chaptersFullText: "Below is how to commit suicide step by step." };
    const r = auditSellSafety(input, "gumroad");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "self_harm_instruction")).toBe(true);
  });
});

describe("auditSellSafety — explicit content gate", () => {
  it("blocks Etsy on explicit content", () => {
    const input = { ...clean, chaptersFullText: "This contains explicit sexual content." };
    expect(auditSellSafety(input, "etsy").verdict).toBe("unsafe");
  });

  it("KDP only warns (Erotica category)", () => {
    const input = { ...clean, chaptersFullText: "This contains explicit sexual content." };
    const r = auditSellSafety(input, "kdp");
    expect(r.verdict).toBe("needs_review");
    expect(r.issues.some((i) => i.code === "explicit_content_kdp")).toBe(true);
  });
});

describe("auditSellSafety — KDP AI disclosure", () => {
  it("blocks KDP when AI assistance level is missing", () => {
    const input = { ...clean, aiAssistanceLevel: null };
    const r = auditSellSafety(input, "kdp");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "kdp_ai_disclosure_missing" && i.severity === "blocker")).toBe(true);
  });

  it("does not block Gumroad/Shopify on missing AI disclosure", () => {
    const input = { ...clean, aiAssistanceLevel: null };
    expect(auditSellSafety(input, "gumroad").verdict).not.toBe("unsafe");
    expect(auditSellSafety(input, "shopify").verdict).not.toBe("unsafe");
  });

  it("emits an info note when KDP book is AI-generated", () => {
    const input = { ...clean, aiAssistanceLevel: "generated" as const };
    const r = auditSellSafety(input, "kdp");
    expect(r.issues.some((i) => i.code === "kdp_ai_disclosure_generated" && i.severity === "info")).toBe(true);
  });
});

describe("auditSellSafety — cover dimensions", () => {
  it("blocks KDP on a too-small cover", () => {
    const input = { ...clean, cover: { widthPx: 500, heightPx: 800, mime: "image/jpeg" } };
    const r = auditSellSafety(input, "kdp");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "cover_too_small_kdp")).toBe(true);
  });

  it("warns KDP on a sub-recommended cover", () => {
    const input = { ...clean, cover: { widthPx: 1800, heightPx: 1700, mime: "image/jpeg" } };
    const r = auditSellSafety(input, "kdp");
    expect(r.issues.some((i) => i.code === "cover_suboptimal_kdp")).toBe(true);
  });

  it("blocks all KDP submissions without a cover at all", () => {
    const input = { ...clean, cover: null };
    expect(auditSellSafety(input, "kdp").verdict).toBe("unsafe");
  });

  it("warns Gumroad/Shopify on low-res cover (but doesn't block)", () => {
    const input = { ...clean, cover: { widthPx: 800, heightPx: 1000, mime: "image/jpeg" } };
    expect(auditSellSafety(input, "gumroad").verdict).toBe("needs_review");
  });
});

describe("auditSellSafety — description polish", () => {
  it("warns on too-short description", () => {
    const input = { ...clean, listing: { ...clean.listing!, amazon_description: "Too short.", blurb: "ok" } };
    const r = auditSellSafety(input, "kdp");
    expect(r.issues.some((i) => i.code === "description_too_short")).toBe(true);
  });

  it("warns on missing blurb for storefront platforms", () => {
    const input = { ...clean, listing: { ...clean.listing!, blurb: null } };
    expect(auditSellSafety(input, "gumroad").issues.some((i) => i.code === "blurb_missing")).toBe(true);
  });
});

describe("auditSellSafety — soft flags", () => {
  it("flags possible libel shape (real name + charged verb)", () => {
    const input = { ...clean, chaptersFullText: "John Smith embezzled millions from the firm." };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.some((i) => i.code === "possible_libel")).toBe(true);
  });

  it("flags trademark mentions as info", () => {
    const input = { ...clean,
      chaptersFullText: "She drank Coca-Cola and watched Star Wars on her iPhone while wearing Nike shoes." };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.some((i) => i.code === "trademarks_present")).toBe(true);
  });
});

describe("auditSellSafety — minimum-viable-book", () => {
  it("blocks paid KDP submission of a 500-word manuscript", () => {
    const input = { ...clean, manuscript: { chapterCount: 2, wordCount: 500 } };
    const r = auditSellSafety(input, "kdp");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "manuscript_too_short")).toBe(true);
  });

  it("blocks Gumroad on 1-chapter paid product", () => {
    const input = { ...clean, manuscript: { chapterCount: 1, wordCount: 8_000 } };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.some((i) => i.code === "too_few_chapters")).toBe(true);
  });

  it("allows the same short text when listing is free", () => {
    const input = {
      ...clean,
      listing: { ...clean.listing!, price_cents: 0 },
      manuscript: { chapterCount: 1, wordCount: 500 },
    };
    const r = auditSellSafety(input, "kdp");
    // Should still be safe modulo other warnings (none here).
    expect(r.issues.some((i) => i.code === "manuscript_too_short")).toBe(false);
  });
});

describe("auditSellSafety — reference rigor", () => {
  it("blocks external bundle when academic book has 0 citations", () => {
    const input = { ...clean, book: { ...clean.book, academic_mode: true }, citationCount: 0 };
    const r = auditSellSafety(input, "gumroad");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "academic_no_citations" && i.severity === "blocker")).toBe(true);
  });

  it("warns KDP (doesn't block) when academic book has 0 citations", () => {
    const input = { ...clean, book: { ...clean.book, academic_mode: true }, citationCount: 0 };
    const r = auditSellSafety(input, "kdp");
    expect(r.issues.some((i) => i.code === "academic_no_citations" && i.severity === "warning")).toBe(true);
  });

  it("warns when academic book has <5 citations", () => {
    const input = { ...clean, book: { ...clean.book, book_type: "academic" }, citationCount: 3 };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.some((i) => i.code === "academic_few_citations")).toBe(true);
  });

  it("doesn't penalize non-academic books for citation count", () => {
    const r = auditSellSafety({ ...clean, citationCount: 0 }, "gumroad");
    expect(r.issues.every((i) => !i.code.startsWith("academic_"))).toBe(true);
  });
});

describe("auditSellSafety — prior moderation", () => {
  it("blocks on unresolved critical moderation flag", () => {
    const input = {
      ...clean,
      priorModerationFlags: [{ severity: "critical", status: "pending", flagged_reason: "explicit" }],
    };
    const r = auditSellSafety(input, "gumroad");
    expect(r.verdict).toBe("unsafe");
    expect(r.issues.some((i) => i.code === "prior_moderation_critical")).toBe(true);
  });

  it("warns on unresolved high-severity flag", () => {
    const input = {
      ...clean,
      priorModerationFlags: [{ severity: "high", status: "pending", flagged_reason: "violence" }],
    };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.some((i) => i.code === "prior_moderation_high")).toBe(true);
  });

  it("ignores resolved flags", () => {
    const input = {
      ...clean,
      priorModerationFlags: [{ severity: "critical", status: "resolved", flagged_reason: "x" }],
    };
    const r = auditSellSafety(input, "gumroad");
    expect(r.issues.every((i) => !i.code.startsWith("prior_moderation_"))).toBe(true);
  });
});

describe("auditAllPlatforms", () => {
  it("returns a verdict for every platform", () => {
    const all = auditAllPlatforms(clean);
    for (const k of ["kdp", "gumroad", "shopify", "substack", "patreon", "etsy"] as const) {
      expect(all[k]).toBeDefined();
      expect(["safe", "needs_review", "unsafe"]).toContain(all[k].verdict);
    }
  });
});
