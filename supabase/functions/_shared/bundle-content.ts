// Pure content generators for external-publishing bundles.
//
// Everything in this file is a pure function of (book, listing, chapters,
// authorProfile, platform). No I/O, no environment access. That lets unit
// tests pin the exact wording shipped to creators' Gumroad/Substack/etc.
// listings and catches regressions before they hit production buyers.

export type BundlePlatform = "kdp" | "gumroad" | "shopify" | "substack" | "patreon" | "etsy";

export interface BundleBook {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  category?: string | null;
  book_type?: string | null;
}

export interface BundleListing {
  slug?: string | null;
  subtitle?: string | null;
  blurb?: string | null;
  amazon_description?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  seo_keywords?: unknown;
  seo_categories?: unknown;
  backend_keywords?: unknown;
  license_type?: string | null;
  sample_chapters?: number | null;
}

export interface BundleAuthor {
  display_name?: string | null;
  bio?: string | null;
  website_url?: string | null;
  x_url?: string | null;
  linkedin_url?: string | null;
  avatar_url?: string | null;
  /** Optional list of other titles by the same author for back-matter. */
  also_by?: Array<{ title: string; url?: string | null }> | null;
}

export interface BundleExtras {
  /** Author-declared AI assistance level — surfaced in ai-disclosure.md. */
  aiAssistanceLevel?: "none" | "assisted" | "generated" | null;
  /** Optional dedication line for the front matter. */
  dedication?: string | null;
  /** Optional epigraph for the front matter (quote + attribution). */
  epigraph?: { text: string; attribution?: string | null } | null;
  /** Optional ISBN for the copyright page. */
  isbn?: string | null;
}

export interface BundleChapter {
  chapter_number: number;
  title: string | null;
  content?: string | null;
}

export interface BundleContext {
  platform: BundlePlatform;
  book: BundleBook;
  listing: BundleListing | null;
  chapters: BundleChapter[];
  author: BundleAuthor | null;
  generatedAt: string;
  correlationId: string;
  /** SHA-256 of the source manuscript text; included in metadata.json. */
  contentHash?: string | null;
  /** Optional extras for elite front/back-matter polish. */
  extras?: BundleExtras | null;
}

export const PLATFORM_LABEL: Record<BundlePlatform, string> = {
  kdp: "Amazon KDP",
  gumroad: "Gumroad",
  shopify: "Shopify",
  substack: "Substack",
  patreon: "Patreon",
  etsy: "Etsy",
};

export const PLATFORM_UPLOAD_URL: Record<BundlePlatform, string> = {
  kdp: "https://kdp.amazon.com",
  gumroad: "https://app.gumroad.com/products/new",
  shopify: "https://admin.shopify.com/store",
  substack: "https://substack.com/dashboard",
  patreon: "https://www.patreon.com/posts/new",
  etsy: "https://www.etsy.com/your/shops/me/tools/listings",
};

// ───────────── helpers ─────────────────────────────────────────────────────

export function slugify(s: string | null | undefined, fallback = "untitled"): string {
  const out = (s || "").toString().toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return out || fallback;
}

export function bundleFilename(book: BundleBook, platform: BundlePlatform): string {
  return `${slugify(book.title)}-${platform}-bundle.zip`;
}

function arr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function priceLabel(cents: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "Free";
  const cur = (currency || "USD").toUpperCase();
  return `${cur} ${(n / 100).toFixed(2)}`;
}

const ZERO_WIDTH = /[​-‍﻿]/g;

function cleanProse(s: string | null | undefined, maxLen = 6000): string {
  if (!s) return "";
  return s
    .replace(ZERO_WIDTH, "")
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
}

// ───────────── front matter / metadata ─────────────────────────────────────

export function renderFrontMatter(ctx: BundleContext): string {
  const { book, listing, author, extras } = ctx;
  const year = new Date(ctx.generatedAt).getUTCFullYear();
  const publisher = "ScrollLibrary";
  const lines: string[] = [];

  lines.push(`# ${book.title}`);
  if (book.subtitle || listing?.subtitle) lines.push(``, `*${book.subtitle ?? listing?.subtitle}*`);
  if (author?.display_name) lines.push(``, `by ${author.display_name}`);
  lines.push(``, `---`, ``);

  // Optional dedication — appears on its own page-equivalent above the
  // copyright. Real publishers do this; the bundle now supports it.
  if (extras?.dedication?.trim()) {
    lines.push(`## Dedication`, ``, cleanProse(extras.dedication, 400), ``, `---`, ``);
  }

  // Optional epigraph — short quote, attributed.
  if (extras?.epigraph?.text?.trim()) {
    const epi = extras.epigraph;
    lines.push(`> ${cleanProse(epi.text, 400)}`);
    if (epi.attribution) lines.push(`>`, `> — ${cleanProse(epi.attribution, 120)}`);
    lines.push(``, `---`, ``);
  }

  lines.push(`## Copyright`, ``);
  lines.push(`© ${year} ${author?.display_name ?? "The Author"}. All rights reserved.`, ``);
  lines.push(`Published via ${publisher}.`, ``);
  lines.push(`License: ${humanLicense(listing?.license_type)}.`, ``);
  if (extras?.isbn) lines.push(`ISBN: ${extras.isbn}`, ``);
  if (book.id) lines.push(`Reference: SPC-SL-${year}-${book.id.slice(0, 8).toUpperCase()}`, ``);
  if (ctx.contentHash) lines.push(`Manuscript integrity hash (SHA-256): \`${ctx.contentHash}\``, ``);
  lines.push(`No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without prior written permission of the copyright holder, except for brief quotations in critical reviews and certain other non-commercial uses permitted by copyright law.`, ``);

  lines.push(`---`, ``, `## Table of contents`, ``);
  for (const ch of ctx.chapters) {
    const num = String(ch.chapter_number).padStart(2, "0");
    lines.push(`- Chapter ${num} — ${ch.title?.trim() || "Untitled"}`);
  }

  if (author?.bio?.trim()) {
    lines.push(``, `---`, ``, `## About the author`, ``);
    if (author.display_name) lines.push(`**${author.display_name}**`, ``);
    lines.push(cleanProse(author.bio, 1500));
    const links: string[] = [];
    if (author.website_url) links.push(`[Website](${author.website_url})`);
    if (author.x_url) links.push(`[X](${author.x_url})`);
    if (author.linkedin_url) links.push(`[LinkedIn](${author.linkedin_url})`);
    if (links.length) lines.push(``, links.join(" · "));
  }

  return lines.join("\n");
}

/**
 * Back-matter document. Mirrors what every elite publisher attaches at the
 * tail of a book: a thank-you, a review CTA (Amazon discoverability cares
 * about review velocity), an "Also by this author" list, and the author's
 * link block.
 */
export function renderBackMatter(ctx: BundleContext): string {
  const { book, author, extras } = ctx;
  const lines: string[] = [];
  lines.push(`# Thank you`, ``);
  lines.push(
    `Thank you for reading ${book.title}. If you enjoyed it, the single most ` +
    `valuable thing you can do is leave an honest review on the platform ` +
    `where you bought it — it helps new readers find the book.`,
    ``,
  );
  lines.push(`---`, ``, `## Leave a review`, ``);
  lines.push(`- On Amazon (KDP): search "${book.title}" and tap the review button.`);
  lines.push(`- On Gumroad: rate the product from your library.`);
  lines.push(`- On Goodreads, Bookbub, StoryGraph: a short rating is enough.`, ``);

  if (author?.also_by && author.also_by.length > 0) {
    lines.push(`---`, ``, `## Also by ${author.display_name ?? "this author"}`, ``);
    for (const b of author.also_by.slice(0, 12)) {
      lines.push(b.url ? `- [${b.title}](${b.url})` : `- ${b.title}`);
    }
    lines.push(``);
  }

  if (author?.display_name || author?.website_url || author?.x_url || author?.linkedin_url) {
    lines.push(`---`, ``, `## Stay in touch`, ``);
    if (author.display_name) lines.push(`**${author.display_name}**`, ``);
    const links: string[] = [];
    if (author.website_url) links.push(`[Website](${author.website_url})`);
    if (author.x_url) links.push(`[X / Twitter](${author.x_url})`);
    if (author.linkedin_url) links.push(`[LinkedIn](${author.linkedin_url})`);
    if (links.length) lines.push(links.join(" · "));
  }

  // AI assistance disclosure block — required by Amazon KDP as of 2023.
  if (extras?.aiAssistanceLevel && extras.aiAssistanceLevel !== "none") {
    lines.push(``, `---`, ``, `## AI assistance disclosure`, ``);
    lines.push(aiDisclosureBlock(extras.aiAssistanceLevel));
  }
  return lines.join("\n");
}

/**
 * Stand-alone AI-disclosure document for the KDP bundle. Amazon's content
 * review wants a clear declaration; this is the text creators paste into
 * their KDP submission form (it doesn't accept hyperlinks — plain prose only).
 */
export function renderAiDisclosure(ctx: BundleContext): string {
  const level = ctx.extras?.aiAssistanceLevel ?? "none";
  const lines: string[] = [];
  lines.push(`# AI assistance disclosure`, ``);
  lines.push(`Title: **${ctx.book.title}**`, ``);
  lines.push(`Author: ${ctx.author?.display_name ?? "Independent author"}`, ``);
  lines.push(`Generated at: ${ctx.generatedAt}`, ``);
  lines.push(`---`, ``);
  lines.push(`## Declared level`, ``, `**${level.toUpperCase()}**`, ``);
  lines.push(aiDisclosureBlock(level), ``);
  lines.push(`---`, ``);
  lines.push(`## Amazon KDP submission text`, ``);
  lines.push(`> ${amazonKdpText(level)}`, ``);
  lines.push(
    `Copy the block above into the AI-content disclosure prompt when ` +
    `submitting to KDP. Amazon may also require you to tick a separate ` +
    `checkbox: do not skip it.`,
  );
  return lines.join("\n");
}

function aiDisclosureBlock(level: "none" | "assisted" | "generated" | null | undefined): string {
  switch (level) {
    case "generated":
      return "This work was created with the help of generative AI. The text was generated by an AI system, then reviewed and edited by the author before publication. Citations and factual claims have been verified against primary sources where possible.";
    case "assisted":
      return "Portions of this work were created with the help of generative AI. The author wrote the manuscript, with AI used for ideation, outlining, copy-editing, or summarisation. The narrative voice and the final text are the author's.";
    case "none":
    default:
      return "This work was created without the use of generative AI tools.";
  }
}

function amazonKdpText(level: "none" | "assisted" | "generated" | null | undefined): string {
  if (level === "generated") return "AI-generated: the text in this book was produced using generative AI tools.";
  if (level === "assisted")  return "AI-assisted: generative AI tools were used to ideate, outline, or copy-edit; the author wrote the manuscript.";
  return "No AI use: this book was written without the use of generative AI.";
}

function humanLicense(code: string | null | undefined): string {
  switch ((code || "personal").toLowerCase()) {
    case "personal": return "Personal use only";
    case "commercial": return "Commercial use permitted";
    case "educational": return "Educational use permitted";
    case "institutional": return "Institutional / site licence";
    case "resale": return "Resale rights granted";
    default: return "Personal use only";
  }
}

// ───────────── descriptions (platform-tuned) ───────────────────────────────

/**
 * Long-form polished description in markdown — what goes into the upstream
 * product page body. Uses the author's amazon_description as the seed, then
 * decorates with a hook line, benefit bullets, author byline, and a tasteful
 * "what's inside" rollup.
 */
export function renderLongDescription(ctx: BundleContext): string {
  const { book, listing, author, chapters } = ctx;
  const seed = cleanProse(listing?.amazon_description || listing?.blurb || book.description || "", 4000);
  const blurb = cleanProse(listing?.blurb || "", 280);
  const bullets = extractBullets(seed);

  const out: string[] = [];
  out.push(`# ${book.title}`);
  if (listing?.subtitle || book.subtitle) out.push(``, `*${listing?.subtitle ?? book.subtitle}*`);
  if (blurb) out.push(``, blurb);
  if (seed) out.push(``, seed);
  if (bullets.length > 0) {
    out.push(``, `## What's inside`, ``);
    for (const b of bullets.slice(0, 8)) out.push(`- ${b}`);
  }
  out.push(``, `## At a glance`, ``);
  out.push(`- ${chapters.length} chapters`);
  out.push(`- License: ${humanLicense(listing?.license_type)}`);
  if (ctx.platform === "kdp") out.push(`- Print-ready PDF (KDP-trim formatted)`);
  if (ctx.platform === "etsy") out.push(`- Print-at-home and digital download`);
  if (author?.display_name) {
    out.push(``, `## About the author`, ``);
    out.push(`**${author.display_name}**${author.bio ? ` — ${cleanProse(author.bio, 400)}` : ""}`);
  }
  return out.join("\n");
}

/** ≤ 280 chars; safe to drop into Stripe/Gumroad headline or a tweet. */
export function renderShortDescription(ctx: BundleContext): string {
  const seed = ctx.listing?.blurb || ctx.listing?.subtitle || ctx.book.description || ctx.book.title;
  return cleanProse(seed ?? "", 280);
}

function extractBullets(prose: string): string[] {
  const bullets: string[] = [];
  for (const line of prose.split(/\n+/)) {
    const m = line.match(/^\s*[-*•]\s+(.+)/);
    if (m) bullets.push(cleanProse(m[1], 200));
  }
  return bullets;
}

// ───────────── keywords / categories / tags ────────────────────────────────

export interface KeywordExports {
  keywords: string[];
  categories: string[];
  backendKeywords: string[];
  /** Up to 13, exactly to Etsy's listing tag cap, lowercased. */
  etsyTags: string[];
}

export function renderKeywords(listing: BundleListing | null, book: BundleBook): KeywordExports {
  const keywords = unique(arr(listing?.seo_keywords)).slice(0, 7);
  const categories = unique(arr(listing?.seo_categories)).slice(0, 2);
  const backendKeywords = unique(arr(listing?.backend_keywords)).slice(0, 8);

  const tagSeed = unique([
    ...keywords.map((k) => k.toLowerCase()),
    ...(book.category ? [book.category.toLowerCase()] : []),
  ]);
  const etsyTags = tagSeed
    .map((t) => t.replace(/[^a-z0-9 ]/g, "").trim())
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 13);

  return { keywords, categories, backendKeywords, etsyTags };
}

function unique<T>(xs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of xs) {
    const key = String(x).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

// ───────────── machine-readable license + human license ────────────────────

export interface LicenseBlock { md: string; json: Record<string, unknown>; }

export function renderLicense(ctx: BundleContext): LicenseBlock {
  const code = (ctx.listing?.license_type || "personal").toLowerCase();
  const year = new Date(ctx.generatedAt).getUTCFullYear();
  const holder = ctx.author?.display_name ?? "The Author";

  const md = [
    `# License`,
    ``,
    `**License type:** ${humanLicense(code)} (\`${code}\`)`,
    `**Title:** ${ctx.book.title}`,
    `**Copyright:** © ${year} ${holder}`,
    `**Issued by:** ScrollLibrary`,
    `**Issued at:** ${ctx.generatedAt}`,
    ctx.contentHash ? `**Integrity hash (SHA-256):** \`${ctx.contentHash}\`` : ``,
    ``,
    `## Permitted uses`,
    ``,
    licenseClauses(code),
    ``,
    `## Prohibited uses`,
    ``,
    `- Redistribution of this file or its contents to third parties without prior written permission.`,
    `- Use of the manuscript to train, fine-tune, or evaluate machine-learning models.`,
    `- Removal of this license file or the front-matter copyright page from any derivative work.`,
    ``,
    `If you received this file from someone other than the rights holder, please contact the author.`,
  ].filter(Boolean).join("\n");

  const json = {
    license_code: code,
    license_label: humanLicense(code),
    copyright_year: year,
    rights_holder: holder,
    issued_by: "ScrollLibrary",
    issued_at: ctx.generatedAt,
    integrity_sha256: ctx.contentHash ?? null,
    book: { id: ctx.book.id, title: ctx.book.title },
  };
  return { md, json };
}

function licenseClauses(code: string): string {
  if (code === "commercial") return "- Use in your own commercial products and services.\n- Adapt and excerpt with attribution.";
  if (code === "educational") return "- Use in classroom and educational settings.\n- Reproduce excerpts for student materials with attribution.";
  if (code === "institutional") return "- Distribute within the licensed institution.\n- Use in internal training and reference materials.";
  if (code === "resale") return "- Resell to end users.\n- Re-brand and re-package per the resale agreement.";
  return "- Single-user personal reading on any device you own.\n- Quote brief passages in reviews with attribution.";
}

// ───────────── social caption pack (platform-shaped) ───────────────────────

export interface SocialPack {
  twitter: string;
  linkedin: string;
  instagram: string;
  threads: string;
}

const MAX_TWEET = 280;

export function renderSocialPack(ctx: BundleContext): SocialPack {
  const title = ctx.book.title;
  const blurb = cleanProse(ctx.listing?.blurb ?? ctx.listing?.subtitle ?? ctx.book.description ?? "", 200);
  const tags = renderKeywords(ctx.listing, ctx.book).keywords;
  const hash = tags.map((t) => "#" + t.replace(/[^A-Za-z0-9]/g, "")).filter((h) => h.length > 1).slice(0, 5).join(" ");
  const link = "👉 " + (ctx.listing?.slug ? `/store/${ctx.listing.slug}` : "(link in bio)");

  const twitter = clip(`📚 New release: ${title}\n${blurb}\n${link}\n${hash}`, MAX_TWEET);
  const threads = clip(`Just launched ${title}.\n\n${blurb}\n\n${link}\n${hash}`, 500);
  const linkedin = [
    `I just published **${title}**.`,
    ``,
    blurb,
    ``,
    `Inside you'll find ${ctx.chapters.length} chapters covering ${tags.slice(0, 3).join(", ") || "the topic in depth"}.`,
    ``,
    `${link}`,
    ``,
    hash,
  ].join("\n");
  const instagram = [
    `New release: ${title}`,
    ``,
    blurb,
    ``,
    `→ Save this post`,
    `→ ${link}`,
    ``,
    hash,
  ].join("\n");
  return { twitter, linkedin, instagram, threads };
}

function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…";
}

// ───────────── editor report (multi-section human audit) ──────────────────

export interface EditorReportInput {
  structuralIssues: Array<{ severity: string; code: string; message: string; chapter?: number; hint?: string }>;
  contentCleanupIssues: Array<{ severity: string; code: string; message: string; chapter?: number; hint?: string }>;
  styleIssues: Array<{ severity: string; code: string; message: string; chapter?: number; hint?: string }>;
  sellSafetyByPlatform: Record<string, { verdict: string; summary: string; issues: Array<{ severity: string; code: string; message: string; hint?: string }> }>;
  styleTotals?: {
    words: number;
    cliche_per_1k_overall: number;
    em_dash_per_1k_overall: number;
    adverb_rate_overall: number;
    passive_rate_overall: number;
    reading_grade_mean: number;
    reading_grade_stddev: number;
  };
  contentCleanupStats?: Record<string, number | boolean>;
  qualityScore?: number;
}

/**
 * Human-readable multi-section report shipped inside every bundle as
 * `editor-report.md`. Tells the creator exactly what passes, what needs
 * review, and what blocks distribution per platform.
 */
export function renderEditorReport(ctx: BundleContext, input: EditorReportInput): string {
  const lines: string[] = [];
  lines.push(`# Editor's report — ${ctx.book.title}`, ``);
  lines.push(`Generated ${ctx.generatedAt}`, ``);
  if (typeof input.qualityScore === "number") {
    lines.push(`**Overall export quality:** ${Math.round(input.qualityScore)} / 100`, ``);
  }

  // Style totals → at-a-glance verdicts
  if (input.styleTotals) {
    const s = input.styleTotals;
    lines.push(`## Manuscript metrics`, ``);
    lines.push(`| Metric | Value | Publisher target |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| Words | ${s.words.toLocaleString()} | — |`);
    lines.push(`| Cliché density / 1k words | ${s.cliche_per_1k_overall.toFixed(2)} | < 2.0 |`);
    lines.push(`| Em-dash density / 1k words | ${s.em_dash_per_1k_overall.toFixed(2)} | < 8.0 |`);
    lines.push(`| Adverb rate | ${(s.adverb_rate_overall * 100).toFixed(1)}% | < 3% |`);
    lines.push(`| Passive voice rate | ${(s.passive_rate_overall * 100).toFixed(0)}% | < 20% |`);
    lines.push(`| Reading grade (mean) | ${s.reading_grade_mean.toFixed(1)} | consistent |`);
    lines.push(`| Reading grade (variance ±) | ${s.reading_grade_stddev.toFixed(1)} | < 5 |`);
    lines.push(``);
  }

  // Cleanup stats — what the bundle pipeline auto-fixed
  if (input.contentCleanupStats && Object.keys(input.contentCleanupStats).length > 0) {
    lines.push(`## Automatic cleanup applied`, ``);
    for (const [k, v] of Object.entries(input.contentCleanupStats)) {
      if (k === "changed") continue;
      if (typeof v === "number" && v > 0) lines.push(`- ${k.replace(/_/g, " ")}: ${v}`);
    }
    lines.push(``);
  }

  // Issue lists by category
  renderIssueSection(lines, "Structural issues", input.structuralIssues);
  renderIssueSection(lines, "Content issues", input.contentCleanupIssues);
  renderIssueSection(lines, "Style issues", input.styleIssues);

  // Per-platform sell-safety
  lines.push(`## Platform safety verdicts`, ``);
  for (const [platform, rep] of Object.entries(input.sellSafetyByPlatform)) {
    const badge = rep.verdict === "safe" ? "✅" : rep.verdict === "needs_review" ? "⚠️" : "⛔";
    lines.push(`### ${badge} ${platform.toUpperCase()} — ${rep.verdict}`, ``);
    lines.push(`> ${rep.summary}`, ``);
    if (rep.issues.length > 0) {
      for (const iss of rep.issues.slice(0, 8)) {
        const tag = iss.severity === "blocker" ? "BLOCK" : iss.severity === "warning" ? "WARN" : "INFO";
        lines.push(`- **${tag}** ${iss.message}${iss.hint ? ` — ${iss.hint}` : ""}`);
      }
      if (rep.issues.length > 8) lines.push(`- ...and ${rep.issues.length - 8} more`);
      lines.push(``);
    }
  }

  lines.push(`---`, ``, `*This report was produced automatically by the ScrollLibrary bundle pipeline.*`);
  return lines.join("\n");
}

function renderIssueSection(lines: string[], title: string, issues: Array<{ severity: string; code: string; message: string; chapter?: number; hint?: string }>) {
  lines.push(`## ${title}`, ``);
  if (issues.length === 0) { lines.push(`_None._`, ``); return; }
  const order: Record<string, number> = { blocker: 0, warning: 1, info: 2 };
  const sorted = [...issues].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  for (const iss of sorted.slice(0, 40)) {
    const tag = iss.severity === "blocker" ? "BLOCK" : iss.severity === "warning" ? "WARN" : "INFO";
    const where = typeof iss.chapter === "number" ? ` (ch. ${iss.chapter})` : "";
    lines.push(`- **${tag}**${where} ${iss.message}${iss.hint ? ` — ${iss.hint}` : ""}`);
  }
  if (sorted.length > 40) lines.push(`- ...and ${sorted.length - 40} more`);
  lines.push(``);
}

// ───────────── per-platform README ─────────────────────────────────────────

export function renderReadme(ctx: BundleContext, includedAssets: string[]): string {
  const { platform, book, listing } = ctx;
  const lines: string[] = [];
  lines.push(`# ${PLATFORM_LABEL[platform]} bundle — ${book.title}`, ``);
  lines.push(`Generated ${ctx.generatedAt}`, ``);
  lines.push(`**Upload destination:** ${PLATFORM_UPLOAD_URL[platform]}`, ``);
  lines.push(`**Price:** ${priceLabel(listing?.price_cents ?? null, listing?.currency ?? null)}`, ``);
  lines.push(`**License:** ${humanLicense(listing?.license_type)}`, ``);
  if (ctx.correlationId) lines.push(`**Support reference:** ${ctx.correlationId}`, ``);

  lines.push(`## Bundle contents`, ``);
  for (const f of includedAssets) lines.push(`- ${f}`);

  lines.push(``, `## How to publish`, ``);
  lines.push(...platformSteps(platform));

  lines.push(``, `---`, ``, `Need help? Open the [publishing center](/account/intelligence) inside ScrollLibrary.`);
  return lines.join("\n");
}

function platformSteps(platform: BundlePlatform): string[] {
  switch (platform) {
    case "kdp": return [
      `1. Sign in to KDP (https://kdp.amazon.com) and click **Create > Paperback**.`,
      `2. Use \`description.md\` and \`keywords.txt\` to fill in the metadata.`,
      `3. Upload \`interior.pdf\` and \`cover.jpg\` as the manuscript and cover.`,
      `4. Preview, set pricing, and publish.`,
    ];
    case "gumroad": return [
      `1. Sign in to Gumroad — your product was auto-created if you used **Publish to Gumroad** in ScrollLibrary, otherwise create a Digital Product.`,
      `2. Paste \`description.md\` into the description field, set the price, and add \`assets/social-card.jpg\` as the gallery image.`,
      `3. Upload \`book.pdf\` and \`book.epub\` as the downloadable files.`,
      `4. Add the \`keywords.txt\` entries as tags.`,
      `5. Publish.`,
    ];
    case "shopify": return [
      `1. Sign in to your Shopify admin — your product was auto-created if you used **Publish to Shopify** in ScrollLibrary, otherwise create a new Product.`,
      `2. Paste \`description.md\` into the body field, set the price, upload \`assets/cover.jpg\` (or \`.png\`) as the primary image and \`assets/social-card.*\` as the secondary gallery image.`,
      `3. Install the Shopify Digital Downloads app (free, by Shopify) and attach \`book.pdf\` and \`book.epub\` as the download files.`,
      `4. Add the \`keywords.txt\` entries to product tags.`,
      `5. Save and make the product Active.`,
    ];
    case "substack": return [
      `1. Open your Substack dashboard and import \`chapters/*.md\` one post per week (see \`publishing-schedule.txt\`).`,
      `2. Use \`email-subject-lines.txt\` for the weekly subject lines.`,
      `3. Send \`welcome-email.md\` to new subscribers via the welcome series.`,
    ];
    case "patreon": return [
      `1. Use \`post-schedule.csv\` as your editorial calendar.`,
      `2. Post chapters from \`posts-free/\` publicly and chapters from \`posts-patron-only/\` to paying tiers.`,
      `3. Attach \`assets/social-card.jpg\` to launch posts.`,
    ];
    case "etsy": return [
      `1. Create a new digital listing.`,
      `2. Paste \`description.md\` into the description, copy the 13 tags from \`tags.txt\`, and upload \`assets/social-card.jpg\` as the primary image.`,
      `3. Upload \`printable.pdf\` and \`book.epub\` as the digital files.`,
      `4. Set the price and publish.`,
    ];
  }
}

// ───────────── substack / patreon helpers ──────────────────────────────────

export interface SubstackSchedule { schedule: string; subjects: string; }

export function renderSubstackSchedule(ctx: BundleContext): SubstackSchedule {
  const schedule: string[] = [];
  const subjects: string[] = [];
  const startWeek = new Date(ctx.generatedAt);
  ctx.chapters.forEach((c, i) => {
    const wk = new Date(startWeek);
    wk.setUTCDate(wk.getUTCDate() + i * 7);
    const date = wk.toISOString().slice(0, 10);
    schedule.push(`Week ${i + 1} (${date}): ${c.title ?? "Untitled"}`);
    subjects.push(`New chapter: ${c.title ?? "Untitled"}`);
  });
  return {
    schedule: `Suggested weekly cadence for ${ctx.book.title}:\n\n${schedule.join("\n")}\n`,
    subjects: subjects.join("\n") + "\n",
  };
}

export function renderPatreonCsv(ctx: BundleContext, sampleChapters: number): string {
  const rows: string[] = [`chapter,title,tier,filename,suggested_post_date`];
  const start = new Date(ctx.generatedAt);
  ctx.chapters.forEach((c, i) => {
    const isFree = c.chapter_number <= sampleChapters;
    const tier = isFree ? "Public" : "Patrons";
    const dir = isFree ? "posts-free" : "posts-patron-only";
    const fname = `${dir}/${String(c.chapter_number).padStart(2, "0")}-${slugify(c.title ?? "chapter", "chapter")}.md`;
    const post = new Date(start); post.setUTCDate(post.getUTCDate() + i * 7);
    rows.push(`${c.chapter_number},"${csvSafe(c.title ?? "")}",${tier},${fname},${post.toISOString().slice(0, 10)}`);
  });
  return rows.join("\n") + "\n";
}

function csvSafe(s: string): string {
  return String(s).replace(/"/g, '""');
}

// ───────────── metadata.json (machine-readable bundle manifest) ────────────

export interface BundleManifest {
  title: string;
  subtitle: string;
  description_long: string;
  description_short: string;
  keywords: string[];
  categories: string[];
  backend_keywords: string[];
  etsy_tags: string[];
  license: Record<string, unknown>;
  chapters: number;
  word_count_estimate: number;
  generated_at: string;
  platform: string;
  platform_label: string;
  correlation_id: string;
  content_sha256: string | null;
  bundle_schema_version: string;
  author: { display_name: string | null; bio_preview: string | null } | null;
  pricing: { amount_cents: number; currency: string; label: string };
}

const BUNDLE_SCHEMA_VERSION = "2.0.0";

export function renderManifest(ctx: BundleContext): BundleManifest {
  const kw = renderKeywords(ctx.listing, ctx.book);
  const lic = renderLicense(ctx);
  const wordCount = ctx.chapters.reduce(
    (n, c) => n + (c.content ? c.content.split(/\s+/).filter(Boolean).length : 0),
    0,
  );
  return {
    title: ctx.book.title,
    subtitle: ctx.listing?.subtitle ?? ctx.book.subtitle ?? "",
    description_long: renderLongDescription(ctx),
    description_short: renderShortDescription(ctx),
    keywords: kw.keywords,
    categories: kw.categories,
    backend_keywords: kw.backendKeywords,
    etsy_tags: kw.etsyTags,
    license: lic.json,
    chapters: ctx.chapters.length,
    word_count_estimate: wordCount,
    generated_at: ctx.generatedAt,
    platform: ctx.platform,
    platform_label: PLATFORM_LABEL[ctx.platform],
    correlation_id: ctx.correlationId,
    content_sha256: ctx.contentHash ?? null,
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    author: ctx.author
      ? {
        display_name: ctx.author.display_name ?? null,
        bio_preview: ctx.author.bio ? cleanProse(ctx.author.bio, 200) : null,
      }
      : null,
    pricing: {
      amount_cents: Number(ctx.listing?.price_cents ?? 0) || 0,
      currency: (ctx.listing?.currency ?? "usd").toLowerCase(),
      label: priceLabel(ctx.listing?.price_cents ?? null, ctx.listing?.currency ?? null),
    },
  };
}
