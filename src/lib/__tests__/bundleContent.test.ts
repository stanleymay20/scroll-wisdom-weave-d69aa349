// Pins the contract for what ships in Gumroad/Substack/Patreon/Etsy bundles.
// These functions decide the wording on third-party storefronts — failures
// here mean creators have to manually fix their listings before they sell.
import { describe, it, expect } from "vitest";
import {
  bundleFilename, renderFrontMatter, renderLongDescription, renderShortDescription,
  renderKeywords, renderLicense, renderSocialPack, renderReadme, renderManifest,
  renderSubstackSchedule, renderPatreonCsv, slugify,
  type BundleContext,
} from "../../../supabase/functions/_shared/bundle-content";

const baseCtx = (overrides: Partial<BundleContext> = {}): BundleContext => ({
  platform: "gumroad",
  book: { id: "11111111-2222-3333-4444-555555555555", title: "My Elite Book", subtitle: "A subtitle", description: "Long form.", cover_image_url: "https://cdn/x.jpg", category: "Fiction", book_type: null },
  listing: {
    slug: "my-elite-book",
    subtitle: "A subtitle",
    blurb: "Punchy blurb in under 280 chars.",
    amazon_description: "A longer description with paragraphs.\n\n- bullet one\n- bullet two\n- bullet three",
    price_cents: 999,
    currency: "USD",
    seo_keywords: ["fantasy", "epic", "magic", "kings"],
    seo_categories: ["Fantasy", "Adventure"],
    backend_keywords: ["dragons", "quest"],
    license_type: "personal",
    sample_chapters: 2,
  },
  author: {
    display_name: "Stanley May",
    bio: "Author of long, complicated books.",
    website_url: "https://stanley.dev",
    x_url: "https://x.com/stan",
    linkedin_url: "https://linkedin.com/in/stan",
    avatar_url: null,
  },
  chapters: [
    { chapter_number: 1, title: "Beginnings", content: "First chapter content." },
    { chapter_number: 2, title: "Middle", content: "Second chapter content." },
    { chapter_number: 3, title: "End", content: "Final chapter content." },
  ],
  generatedAt: "2026-06-04T12:00:00.000Z",
  correlationId: "corr-abc",
  contentHash: "deadbeef".repeat(8),
  ...overrides,
});

describe("bundle filename", () => {
  it("uses the book slug + platform, never a UUID", () => {
    expect(bundleFilename(baseCtx().book, "gumroad")).toBe("my-elite-book-gumroad-bundle.zip");
    expect(bundleFilename({ ...baseCtx().book, title: "Wild! Title??" }, "etsy")).toBe("wild-title-etsy-bundle.zip");
  });
});

describe("front matter", () => {
  it("includes title, copyright, author, ToC, integrity hash", () => {
    const md = renderFrontMatter(baseCtx());
    expect(md).toContain("# My Elite Book");
    expect(md).toContain("© 2026 Stanley May");
    expect(md).toContain("Published via ScrollLibrary");
    expect(md).toContain("## Table of contents");
    expect(md).toContain("Chapter 01 — Beginnings");
    expect(md).toContain("Chapter 02 — Middle");
    expect(md).toContain("## About the author");
    expect(md).toContain("SHA-256");
    expect(md).toContain("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  });

  it("omits the author section when there is no bio", () => {
    const ctx = baseCtx({ author: { display_name: "Stanley May", bio: null } });
    const md = renderFrontMatter(ctx);
    expect(md).not.toContain("## About the author");
  });

  it("falls back gracefully when there is no author at all", () => {
    const ctx = baseCtx({ author: null });
    const md = renderFrontMatter(ctx);
    expect(md).toContain("© 2026 The Author");
  });
});

describe("descriptions", () => {
  it("long form includes title, blurb, bullets, what's inside, author byline", () => {
    const md = renderLongDescription(baseCtx());
    expect(md).toContain("# My Elite Book");
    expect(md).toContain("Punchy blurb");
    expect(md).toContain("What's inside");
    expect(md).toContain("- bullet one");
    expect(md).toContain("At a glance");
    expect(md).toContain("3 chapters");
    expect(md).toContain("About the author");
  });

  it("short form is <= 280 chars", () => {
    const short = renderShortDescription(baseCtx());
    expect(short.length).toBeLessThanOrEqual(280);
    expect(short.length).toBeGreaterThan(0);
  });
});

describe("keywords", () => {
  it("respects platform caps", () => {
    const k = renderKeywords(baseCtx().listing, baseCtx().book);
    expect(k.keywords.length).toBeLessThanOrEqual(7);
    expect(k.categories.length).toBeLessThanOrEqual(2);
    expect(k.backendKeywords.length).toBeLessThanOrEqual(8);
    expect(k.etsyTags.length).toBeLessThanOrEqual(13);
  });

  it("dedupes keywords case-insensitively", () => {
    const ctx = baseCtx();
    if (ctx.listing) ctx.listing.seo_keywords = ["fantasy", "Fantasy", "FANTASY", "magic"];
    const k = renderKeywords(ctx.listing, ctx.book);
    expect(k.keywords.filter((x) => x.toLowerCase() === "fantasy").length).toBe(1);
  });

  it("etsy tags are lowercased and stripped of bad chars", () => {
    const ctx = baseCtx();
    if (ctx.listing) ctx.listing.seo_keywords = ["High-Fantasy!", "epic@magic"];
    const k = renderKeywords(ctx.listing, ctx.book);
    for (const t of k.etsyTags) {
      expect(t).toBe(t.toLowerCase());
      expect(/[^a-z0-9 ]/.test(t)).toBe(false);
    }
  });
});

describe("license", () => {
  it("emits both markdown and JSON forms", () => {
    const lic = renderLicense(baseCtx());
    expect(lic.md).toContain("License type:");
    expect(lic.md).toContain("Personal use only");
    expect(lic.md).toContain("Prohibited uses");
    expect(lic.md).toContain("train, fine-tune");
    expect(lic.json.license_code).toBe("personal");
    expect(lic.json.copyright_year).toBe(2026);
    expect(lic.json.integrity_sha256).toBe("deadbeef".repeat(8));
  });

  it("includes commercial clauses for commercial licenses", () => {
    const ctx = baseCtx();
    if (ctx.listing) ctx.listing.license_type = "commercial";
    const lic = renderLicense(ctx);
    expect(lic.md).toContain("Commercial use permitted");
    expect(lic.md).toContain("commercial products");
  });
});

describe("social pack", () => {
  it("respects platform character caps", () => {
    const pack = renderSocialPack(baseCtx());
    expect(pack.twitter.length).toBeLessThanOrEqual(280);
    expect(pack.threads.length).toBeLessThanOrEqual(500);
    expect(pack.linkedin.length).toBeGreaterThan(0);
    expect(pack.instagram.length).toBeGreaterThan(0);
  });

  it("includes the book title and at least one hashtag", () => {
    const pack = renderSocialPack(baseCtx());
    expect(pack.twitter).toContain("My Elite Book");
    expect(pack.twitter).toMatch(/#\w+/);
  });
});

describe("README", () => {
  it("includes platform-specific upload steps", () => {
    const gum = renderReadme(baseCtx({ platform: "gumroad" }), ["book.pdf"]);
    expect(gum).toContain("gumroad.com");
    expect(gum).toContain("description.md");

    const etsy = renderReadme(baseCtx({ platform: "etsy" }), ["printable.pdf"]);
    expect(etsy).toContain("etsy.com");
    expect(etsy).toContain("tags.txt");

    const kdp = renderReadme(baseCtx({ platform: "kdp" }), ["interior.pdf"]);
    expect(kdp).toContain("kdp.amazon.com");
  });

  it("surfaces the correlation id for support", () => {
    const r = renderReadme(baseCtx(), ["book.pdf"]);
    expect(r).toContain("corr-abc");
  });
});

describe("substack helpers", () => {
  it("schedule has one entry per chapter, ISO dates", () => {
    const sched = renderSubstackSchedule(baseCtx());
    expect(sched.schedule.match(/Week \d+/g)?.length).toBe(3);
    expect(sched.subjects.split("\n").filter(Boolean).length).toBe(3);
    expect(sched.subjects).toContain("New chapter: Beginnings");
  });
});

describe("patreon csv", () => {
  it("splits chapters between free and patron tiers at the sample boundary", () => {
    const csv = renderPatreonCsv(baseCtx(), 2);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("chapter,title,tier,filename");
    expect(lines.filter((l) => l.includes(",Public,")).length).toBe(2);
    expect(lines.filter((l) => l.includes(",Patrons,")).length).toBe(1);
  });

  it("escapes embedded quotes in chapter titles", () => {
    const ctx = baseCtx();
    ctx.chapters[0].title = 'Has "quotes"';
    const csv = renderPatreonCsv(ctx, 1);
    expect(csv).toContain('""quotes""');
  });
});

describe("manifest", () => {
  it("includes schema version + integrity hash + price", () => {
    const m = renderManifest(baseCtx());
    expect(m.bundle_schema_version).toBe("2.0.0");
    expect(m.content_sha256).toBe("deadbeef".repeat(8));
    expect(m.chapters).toBe(3);
    expect(m.pricing.amount_cents).toBe(999);
    expect(m.pricing.currency).toBe("usd");
    expect(m.pricing.label).toBe("USD 9.99");
    expect(m.word_count_estimate).toBeGreaterThan(0);
  });

  it("free pricing renders as 'Free'", () => {
    const ctx = baseCtx();
    if (ctx.listing) ctx.listing.price_cents = 0;
    const m = renderManifest(ctx);
    expect(m.pricing.label).toBe("Free");
  });
});

describe("slugify", () => {
  it("normalises diacritics and punctuation", () => {
    expect(slugify("Café — Édition")).toBe("cafe-edition");
    expect(slugify("")).toBe("untitled");
    expect(slugify(null)).toBe("untitled");
  });
});
