// Pre-publish safety verifier for external selling platforms.
//
// What this is for
// ----------------
// auditBookForExport gates structural quality; content-quality strips AI
// noise; style-quality gates literary polish. None of them answer the
// question that matters at the publish-button moment:
//
//   "Is this book safe to push to KDP / Gumroad / Shopify right now?"
//
// Different platforms have different bars. Amazon KDP rejects content that
// the others don't care about (uncleared trademarks, missing AI disclosure
// after 2023, cover dimensions below their spec); Gumroad/Shopify have
// looser content rules but care about cover image quality and product
// descriptions. This module produces a per-platform verdict so the
// publish-to-* edge functions and the one-click client can refuse early.
//
// All exports are pure functions. No I/O, no env access. Same inputs ⇒
// same outputs ⇒ unit-testable end-to-end.

import type { ContentIssue } from "./content-quality.ts";

export type SellPlatform = "kdp" | "gumroad" | "shopify" | "substack" | "patreon" | "etsy";

export type SellSafetyVerdict = "safe" | "needs_review" | "unsafe";

export interface SellSafetyReport {
  platform: SellPlatform;
  verdict: SellSafetyVerdict;
  /** Sorted: blockers first, then warnings, then info. */
  issues: ContentIssue[];
  /** A short, one-line summary for UI/toast. */
  summary: string;
}

export interface SellSafetyInput {
  book: {
    title: string;
    description?: string | null;
    category?: string | null;
    book_type?: string | null;
  };
  listing?: {
    blurb?: string | null;
    amazon_description?: string | null;
    price_cents?: number | null;
    currency?: string | null;
    seo_keywords?: unknown;
  } | null;
  chaptersFullText: string;
  /** Author-declared AI assistance level. Stored on books.ai_assistance_level. */
  aiAssistanceLevel?: "none" | "assisted" | "generated" | null;
  /** Cover image dimensions, if known. Populated by asset-fetch. */
  cover?: { widthPx: number; heightPx: number; mime: string } | null;
}

// ─── Pattern banks ─────────────────────────────────────────────────────────

// Hate speech / violent extremism — patterns we treat as blockers regardless
// of platform. Anyone publishing here knowingly will fail KDP, Gumroad,
// Shopify and Etsy review the same way.
const HARD_PROHIBITED: Array<{ code: string; re: RegExp; message: string }> = [
  { code: "hate_target_group",
    re: /\b(?:kill|exterminate|gas|deport|cleanse)\s+(?:all\s+)?(?:the\s+)?(?:jews?|muslims?|blacks?|whites?|gays?|trans|christians?|hindus?)\b/i,
    message: "Explicit incitement to violence against a protected group" },
  { code: "csam_keyword",
    re: /\b(?:child(?:ren)?|minor|underage|teen)\s+(?:porn|sex|sexual|nude|naked)\b/i,
    message: "Possible CSAM keyword combination" },
  { code: "weapon_instruction",
    re: /\bhow\s+to\s+(?:build|make|construct)\s+(?:a\s+)?(?:bomb|nerve\s+agent|nuclear\s+device|biological\s+weapon)\b/i,
    message: "Weapon-construction instructions" },
  { code: "doxxing_instruction",
    re: /\bhow\s+to\s+(?:dox|find\s+(?:someone'?s|the)\s+home\s+address|track\s+someone\s+without)\b/i,
    message: "Doxxing instructions" },
];

// Lighter explicit content — KDP allows erotica in the right category;
// Etsy and a default Shopify storefront don't. Flagged per-platform.
const EXPLICIT_PATTERNS = [
  /\b(?:explicit|graphic)\s+(?:sex|sexual)\b/i,
  /\b(?:porn|pornographic|hardcore)\b/i,
  /\bbdsm\b/i,
];

// Self-harm encouragement (not depiction). Trigger if "how to" + suicide
// methods or pro-ana content.
const SELF_HARM_INSTRUCT = /\bhow\s+to\s+(?:kill\s+(?:yourself|oneself)|commit\s+suicide|starve\s+(?:yourself|to\s+death))\b/i;

// Real-person libel risk — a public figure's full name + a defamatory verb
// in close proximity. Heuristic; flags for human review, doesn't block.
// We deliberately do NOT keep a name list — that would be a maintenance
// trap. We look at the pattern shape: "FirstName LastName" within 10 words
// of a charged verb.
const LIBEL_VERBS = /\b(?:committed|raped|murdered|embezzled|laundered|trafficked)\b/i;

// Trademark / branded names without standard symbols. Same shape as libel:
// flag, don't block. Detecting actual trademark infringement requires a
// real database we don't have.
const COMMON_TRADEMARKS = /\b(?:Coca[-\s]?Cola|Pepsi|McDonald'?s|Nike|Adidas|Disney|Marvel|Pokémon|Pok[eé]mon|Star\s*Wars|Harry\s*Potter|iPhone|iPad|Android|Google|Facebook|Instagram|TikTok|YouTube|Netflix|Tesla)\b/g;

// KDP-specific cover dimensions. Kindle ebook covers need ≥1600px on the
// shorter side; ≥2560px on the longer side is recommended. KDP paperback
// interiors don't need a separate cover image (we ship interior.pdf), but
// the bundle's cover.jpg is used as the social card / Gumroad gallery.
const COVER_MIN_SHORT_PX = 1600;
const COVER_MIN_LONG_PX = 2560;

// ─── Per-platform rules ────────────────────────────────────────────────────

function pushIssue(issues: ContentIssue[], iss: ContentIssue) { issues.push(iss); }

function checkUniversalBlockers(input: SellSafetyInput, issues: ContentIssue[]) {
  const text = input.chaptersFullText;
  for (const p of HARD_PROHIBITED) {
    if (p.re.test(text)) {
      pushIssue(issues, { severity: "blocker", code: p.code, message: p.message,
        hint: "This content category is prohibited by every major selling platform — rewrite or pull the chapter." });
    }
  }
  if (SELF_HARM_INSTRUCT.test(text)) {
    pushIssue(issues, { severity: "blocker", code: "self_harm_instruction",
      message: "Content appears to instruct self-harm",
      hint: "Reframe as recovery / depiction; instructions are blocked." });
  }
}

function checkExplicitContent(input: SellSafetyInput, issues: ContentIssue[], platform: SellPlatform) {
  const text = input.chaptersFullText;
  const hit = EXPLICIT_PATTERNS.some((re) => re.test(text));
  if (!hit) return;
  // Etsy / default Shopify / Patreon (without adult flag) reject explicit content.
  if (platform === "etsy") {
    pushIssue(issues, { severity: "blocker", code: "explicit_content_etsy",
      message: "Explicit content is prohibited on Etsy",
      hint: "Etsy's policy bans pornographic content — move this title to Gumroad or KDP Erotica." });
  }
  if (platform === "kdp") {
    pushIssue(issues, { severity: "warning", code: "explicit_content_kdp",
      message: "Explicit content detected — must publish under KDP's Erotica category",
      hint: "Set the appropriate category in KDP or the book will be removed." });
  }
}

function checkAiDisclosure(input: SellSafetyInput, issues: ContentIssue[], platform: SellPlatform) {
  if (platform !== "kdp") return;
  const level = input.aiAssistanceLevel;
  if (level == null) {
    pushIssue(issues, { severity: "blocker", code: "kdp_ai_disclosure_missing",
      message: "Amazon KDP requires creators to declare AI use before publishing",
      hint: "Set the book's AI assistance level (none / assisted / generated) in the publish settings." });
  } else if (level === "generated") {
    pushIssue(issues, { severity: "info", code: "kdp_ai_disclosure_generated",
      message: "Declared as AI-generated — Amazon requires this disclosure on the KDP submission form",
      hint: "Tick 'AI-generated content' on the KDP submission. Bundle ships an ai-disclosure.md you can quote." });
  }
}

function checkCover(input: SellSafetyInput, issues: ContentIssue[], platform: SellPlatform) {
  if (!input.cover) {
    pushIssue(issues, { severity: platform === "kdp" ? "blocker" : "warning",
      code: "cover_missing",
      message: "No cover image attached to the bundle",
      hint: "Upload a cover before publishing — every platform needs one for the listing card." });
    return;
  }
  const { widthPx, heightPx } = input.cover;
  const shortSide = Math.min(widthPx, heightPx);
  const longSide = Math.max(widthPx, heightPx);

  if (platform === "kdp") {
    if (shortSide < COVER_MIN_SHORT_PX) {
      pushIssue(issues, { severity: "blocker", code: "cover_too_small_kdp",
        message: `Cover is ${widthPx}×${heightPx}px — KDP requires ≥${COVER_MIN_SHORT_PX}px on the short side`,
        hint: "Regenerate the cover at a higher resolution before publishing." });
    } else if (longSide < COVER_MIN_LONG_PX) {
      pushIssue(issues, { severity: "warning", code: "cover_suboptimal_kdp",
        message: `Cover ${widthPx}×${heightPx}px is below KDP's recommended ≥${COVER_MIN_LONG_PX}px on the long side`,
        hint: "Acceptable, but a higher-resolution cover renders sharper in Amazon's grid." });
    }
  }
  if (platform === "gumroad" || platform === "shopify") {
    if (shortSide < 1000) {
      pushIssue(issues, { severity: "warning", code: "cover_low_res",
        message: `Cover ${widthPx}×${heightPx}px will look soft in the storefront`,
        hint: "Aim for ≥1600px on the short side for retina-quality display." });
    }
  }
}

function checkDescriptionPolish(input: SellSafetyInput, issues: ContentIssue[], platform: SellPlatform) {
  const desc = (input.listing?.amazon_description ?? input.listing?.blurb ?? "").trim();
  if (desc.length < 150 && (platform === "kdp" || platform === "gumroad" || platform === "shopify")) {
    pushIssue(issues, { severity: "warning", code: "description_too_short",
      message: `Product description is only ${desc.length} chars — most converting copy is 200–600 chars`,
      hint: "Use the 'AI suggest' button in publish settings, or paste from description.md in the bundle." });
  }
  const blurb = (input.listing?.blurb ?? "").trim();
  if (!blurb && (platform === "gumroad" || platform === "shopify")) {
    pushIssue(issues, { severity: "warning", code: "blurb_missing",
      message: "Storefront blurb is empty",
      hint: "Add a one-sentence pitch for the storefront card." });
  }
}

function checkSoftFlags(input: SellSafetyInput, issues: ContentIssue[]) {
  // Libel-shape sentences. Flag for review only — never block.
  const text = input.chaptersFullText;
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 5000);
  let libel = 0;
  for (const s of sentences) {
    if (/\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(s) && LIBEL_VERBS.test(s)) libel += 1;
    if (libel > 0) break;
  }
  if (libel > 0) {
    pushIssue(issues, { severity: "warning", code: "possible_libel",
      message: "Real-name-shape phrases co-occur with charged verbs",
      hint: "Run a legal sanity check — accusations against named individuals are a libel risk." });
  }

  // Common trademarks. Soft warning so creator can confirm they have rights.
  const tms = text.match(COMMON_TRADEMARKS);
  if (tms && tms.length >= 3) {
    pushIssue(issues, { severity: "info", code: "trademarks_present",
      message: `Common trademark names appear ${tms.length}× in the manuscript`,
      hint: "Make sure you have the right to reference these brands — KDP requires trademark clearance." });
  }
}

// ─── Public surface ────────────────────────────────────────────────────────

export function auditSellSafety(input: SellSafetyInput, platform: SellPlatform): SellSafetyReport {
  const issues: ContentIssue[] = [];
  checkUniversalBlockers(input, issues);
  checkExplicitContent(input, issues, platform);
  checkAiDisclosure(input, issues, platform);
  checkCover(input, issues, platform);
  checkDescriptionPolish(input, issues, platform);
  checkSoftFlags(input, issues);

  // Sort: blockers first, then warnings, then info.
  const order = { blocker: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const verdict: SellSafetyVerdict = blockerCount > 0 ? "unsafe" : warningCount > 0 ? "needs_review" : "safe";

  const summary = verdict === "safe"
    ? `Safe to publish to ${platform.toUpperCase()}.`
    : verdict === "needs_review"
      ? `Publishable to ${platform.toUpperCase()} but ${warningCount} warning${warningCount === 1 ? "" : "s"} should be reviewed.`
      : `Cannot publish to ${platform.toUpperCase()} — ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}: ${issues[0]?.message ?? "see report"}.`;

  return { platform, verdict, issues, summary };
}

/**
 * Audit for every platform. Useful for the bundle pipeline + Quality Panel
 * which want to show "safe on KDP, blocked on Etsy" at a glance.
 */
export function auditAllPlatforms(input: SellSafetyInput): Record<SellPlatform, SellSafetyReport> {
  const out: Partial<Record<SellPlatform, SellSafetyReport>> = {};
  for (const p of ["kdp", "gumroad", "shopify", "substack", "patreon", "etsy"] as SellPlatform[]) {
    out[p] = auditSellSafety(input, p);
  }
  return out as Record<SellPlatform, SellSafetyReport>;
}
