// enqueue-export-bundle — produces the elite-tier ZIP bundle that ships to
// external selling platforms (Gumroad, Substack, Patreon, Etsy) and the
// print-ready interior PDF for Amazon KDP.
//
// Elite-tier bundle invariants:
//   * Quality gate: refuses to ship a bundle with auditBookForExport blockers.
//   * Source of truth: every artefact derives from the same canonical chapter
//     stream the in-app reader uses, so what creators see is what buyers get.
//   * Robust assets: cover image is retried, size-capped, MIME-validated.
//   * Front matter: title page, copyright, integrity hash, ToC, author bio.
//   * Polished descriptions: `description.md` (long) + `description-short.txt`
//     ready to paste into any product page.
//   * EPUB 3.0.1 alongside the PDF for every paid-distribution platform.
//   * SHA-256 manuscript hash for buyer integrity, embedded in metadata.json
//     and the licence block.
//   * Platform-shaped social caption pack (X / LinkedIn / Instagram / Threads).
//   * Step-by-step platform README so the upload flow is one-glance obvious.
//   * Filename: `<book-slug>-<platform>-bundle.zip` (no UUIDs in the URL).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import {
  preflight, json, badRequest, serverError, unauthorized,
  requireUser, validateBody, z, serviceClient,
  enforcePersistentVelocity, enforceUserRiskTier,
} from "../_shared/http.ts";
import { correlationId, PhaseTimer, logExportPhase, logFinancialEvent } from "../_shared/observability.ts";
import { requireCreatorCapability } from "../_shared/entitlements.ts";
import { parseBookToCanonical } from "../_shared/canonicalContent.ts";
import { auditBookForExport } from "../_shared/exportQuality.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";
import { fetchImageAsset, sha256Hex } from "../_shared/asset-fetch.ts";
import {
  bundleFilename, renderFrontMatter, renderLongDescription, renderShortDescription,
  renderKeywords, renderLicense, renderSocialPack, renderReadme, renderManifest,
  renderSubstackSchedule, renderPatreonCsv, PLATFORM_LABEL, slugify,
  type BundleContext, type BundlePlatform,
} from "../_shared/bundle-content.ts";

const EXTERNAL_BUNDLES = new Set<BundlePlatform>(["gumroad", "substack", "patreon", "etsy"]);

const Body = z.object({
  book_id: z.string().uuid(),
  bundle_type: z.enum(["kdp", "gumroad", "substack", "patreon", "etsy"]),
  listing_id: z.string().uuid().optional(),
  options: z.record(z.any()).optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// PDF-emitting platforms reuse export-book; markdown-only platforms skip it.
const PDF_PLATFORMS: BundlePlatform[] = ["kdp", "gumroad", "etsy"];
// EPUB ships with anything sold as a finished digital product.
const EPUB_PLATFORMS: BundlePlatform[] = ["gumroad", "etsy"];

async function runJob(
  jobId: string, userId: string, bookId: string,
  bundleType: BundlePlatform, token: string,
  options: Record<string, any>, corr: string,
) {
  const sc = serviceClient();
  const timer = new PhaseTimer(sc, jobId, corr);
  try {
    await sc.from("export_jobs").update({
      status: "running", started_at: new Date().toISOString(), progress: 5, correlation_id: corr,
    }).eq("id", jobId);
    await timer.stop("queued_to_started");

    // ─── Load source data ───────────────────────────────────────────────
    const { data: book } = await sc.from("books")
      .select("id, title, subtitle, description, cover_image_url, category, book_type, user_id")
      .eq("id", bookId).maybeSingle();
    if (!book) throw new Error("Book not found");

    const { data: chapters } = await sc.from("chapters")
      .select("chapter_number, title, content")
      .eq("book_id", bookId).order("chapter_number");
    const chapterList = chapters ?? [];

    const { data: listing } = await sc.from("public_listings")
      .select("slug, subtitle, blurb, amazon_description, price_cents, currency, seo_keywords, seo_categories, backend_keywords, license_type, sample_chapters, cover_override_url")
      .eq("book_id", bookId).maybeSingle();

    const { data: author } = await sc.from("author_profiles")
      .select("display_name, bio, website_url, x_url, linkedin_url, avatar_url")
      .eq("user_id", userId).maybeSingle();

    await timer.stop("fetch_book", { metadata: { chapters: chapterList.length } });

    // ─── Quality gate ───────────────────────────────────────────────────
    const canonical = parseBookToCanonical(chapterList);
    const audit = auditBookForExport(canonical, {
      hasCover: !!(book.cover_image_url || (listing as any)?.cover_override_url),
      bookType: book.book_type ?? null,
    });
    if (audit.status === "blocked") {
      const blockers = audit.issues.filter((i) => i.severity === "blocker").map((i) => i.message);
      await logPublishEvent(sc, {
        user_id: userId, platform: bundleType, event_type: "publish_validation_failed",
        book_id: bookId, severity: "error", correlation_id: corr,
        message: "Bundle generation refused: export quality blockers",
        metadata: { blockers, score: audit.score },
      });
      throw new Error(`Export quality blocked (score ${audit.score}): ${blockers.slice(0, 3).join("; ")}`);
    }
    await sc.from("export_jobs").update({ progress: 20 }).eq("id", jobId);

    // ─── Build canonical bundle context ─────────────────────────────────
    const generatedAt = new Date().toISOString();
    const sourceForHash = chapterList
      .map((c: any) => `# ${c.title ?? ""}\n${c.content ?? ""}`)
      .join("\n\n---\n\n");
    const contentHash = sourceForHash ? await sha256Hex(sourceForHash) : null;

    const ctx: BundleContext = {
      platform: bundleType,
      book: {
        id: book.id, title: book.title, subtitle: book.subtitle ?? null,
        description: book.description ?? null,
        cover_image_url: book.cover_image_url ?? null,
        category: book.category ?? null,
        book_type: book.book_type ?? null,
      },
      listing: listing as any ?? null,
      chapters: chapterList,
      author: author as any ?? null,
      generatedAt,
      correlationId: corr,
      contentHash,
    };

    // ─── PDF (if applicable) ────────────────────────────────────────────
    let mainPdf: Uint8Array | null = null;
    if (PDF_PLATFORMS.includes(bundleType)) {
      const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/export-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-correlation-id": corr },
        body: JSON.stringify({
          bookId, format: bundleType === "kdp" ? "kdp-pdf" : "pdf",
          kdpTrimSize: options.trim_size ?? "6x9",
        }),
      });
      if (!pdfRes.ok) {
        const errText = await pdfRes.text().catch(() => "");
        throw new Error(`export-book failed (${pdfRes.status}): ${errText.slice(0, 200)}`);
      }
      mainPdf = new Uint8Array(await pdfRes.arrayBuffer());
    }
    await timer.stop("pdf", { metadata: { bytes: mainPdf?.byteLength ?? 0 } });
    await sc.from("export_jobs").update({ progress: 45 }).eq("id", jobId);

    // ─── Cover (robust) ─────────────────────────────────────────────────
    const coverSeed = (listing as any)?.cover_override_url || book.cover_image_url || null;
    const cover = coverSeed ? await fetchImageAsset(coverSeed) : null;
    await timer.stop("cover", { metadata: { ok: !!cover, bytes: cover?.bytes.byteLength ?? 0 } });

    // ─── EPUB (paid digital distribution) ───────────────────────────────
    let epubBytes: Uint8Array | null = null;
    if (EPUB_PLATFORMS.includes(bundleType)) {
      const { buildEpub } = await import("../_shared/epub-builder.ts");
      epubBytes = await buildEpub(JSZip as any, {
        book: ctx.book, listing: ctx.listing, author: ctx.author,
        chapters: ctx.chapters,
        coverBytes: cover?.bytes ?? null,
        coverMime: cover?.mime ?? null,
        generatedAt,
        language: (options.language as string | undefined) ?? "en",
      });
    }
    await timer.stop("epub", { metadata: { bytes: epubBytes?.byteLength ?? 0 } });
    await sc.from("export_jobs").update({ progress: 65 }).eq("id", jobId);

    // ─── Assemble ZIP ───────────────────────────────────────────────────
    const zip = new JSZip();
    const included: string[] = [];

    if (mainPdf) {
      const pdfName = bundleType === "kdp" ? "interior.pdf"
        : bundleType === "etsy" ? "printable.pdf"
        : "book.pdf";
      zip.file(pdfName, mainPdf);
      included.push(`${pdfName} — print/PDF`);
    }
    if (epubBytes) {
      zip.file("book.epub", epubBytes);
      included.push(`book.epub — EPUB 3 for Kindle/Apple Books/Kobo`);
    }

    // assets/
    const assetsDir = zip.folder("assets")!;
    if (cover) {
      assetsDir.file(`cover.${cover.ext}`, cover.bytes);
      included.push(`assets/cover.${cover.ext} — cover image`);
      // Cover doubles as the social card on platforms that need one.
      assetsDir.file(`social-card.${cover.ext}`, cover.bytes);
      included.push(`assets/social-card.${cover.ext} — gallery/social image`);
    }

    // Front matter, descriptions, keywords, license
    zip.file("front-matter.md", renderFrontMatter(ctx));
    included.push(`front-matter.md — title page, copyright, ToC, author bio`);

    zip.file("description.md", renderLongDescription(ctx));
    included.push(`description.md — long-form product description`);

    zip.file("description-short.txt", renderShortDescription(ctx));
    included.push(`description-short.txt — ≤280-char headline`);

    const kw = renderKeywords(ctx.listing, ctx.book);
    zip.file("keywords.txt", kw.keywords.join("\n") + "\n");
    if (kw.categories.length) zip.file("categories.txt", kw.categories.join("\n") + "\n");
    if (kw.backendKeywords.length) zip.file("backend-keywords.txt", kw.backendKeywords.join("\n") + "\n");
    included.push(`keywords.txt — clean keyword list`);

    const lic = renderLicense(ctx);
    zip.file("license.md", lic.md);
    zip.file("license.json", JSON.stringify(lic.json, null, 2));
    included.push(`license.md + license.json — human- and machine-readable licence`);

    const social = renderSocialPack(ctx);
    const socialDir = zip.folder("social")!;
    socialDir.file("twitter.txt", social.twitter);
    socialDir.file("linkedin.txt", social.linkedin);
    socialDir.file("instagram.txt", social.instagram);
    socialDir.file("threads.txt", social.threads);
    included.push(`social/* — platform-shaped launch captions`);

    if (author?.display_name || author?.bio) {
      const bio = [
        `# About ${author?.display_name ?? "the author"}`, ``,
        author?.bio ?? "",
        ``,
        ...(author?.website_url ? [`Website: ${author.website_url}`] : []),
        ...(author?.x_url ? [`X: ${author.x_url}`] : []),
        ...(author?.linkedin_url ? [`LinkedIn: ${author.linkedin_url}`] : []),
      ].join("\n");
      zip.file("author-bio.md", bio);
      included.push(`author-bio.md — drop-in author byline`);
    }

    // Substack
    if (bundleType === "substack") {
      const chDir = zip.folder("chapters")!;
      ctx.chapters.forEach((c) => {
        const fname = `${String(c.chapter_number).padStart(2, "0")}-${slugify(c.title ?? "chapter", "chapter")}.md`;
        chDir.file(fname, `# ${c.title ?? "Untitled"}\n\n${c.content ?? ""}\n`);
      });
      const sched = renderSubstackSchedule(ctx);
      zip.file("publishing-schedule.txt", sched.schedule);
      zip.file("email-subject-lines.txt", sched.subjects);
      const blurb = ctx.listing?.blurb ?? ctx.book.description ?? "";
      zip.file("welcome-email.md",
        `# Welcome to ${ctx.book.title}\n\n${blurb}\n\nNew chapter every week. — ${author?.display_name ?? "The Author"}\n`);
      included.push(`chapters/*.md, publishing-schedule.txt, email-subject-lines.txt, welcome-email.md`);
    }

    // Patreon
    if (bundleType === "patreon") {
      const sample = Math.max(1, Number(ctx.listing?.sample_chapters ?? 1));
      const freeDir = zip.folder("posts-free")!;
      const patronDir = zip.folder("posts-patron-only")!;
      ctx.chapters.forEach((c) => {
        const dir = c.chapter_number <= sample ? freeDir : patronDir;
        const fname = `${String(c.chapter_number).padStart(2, "0")}-${slugify(c.title ?? "chapter", "chapter")}.md`;
        dir.file(fname, `# ${c.title ?? "Untitled"}\n\n${c.content ?? ""}\n`);
      });
      zip.file("post-schedule.csv", renderPatreonCsv(ctx, sample));
      included.push(`posts-free/* + posts-patron-only/*, post-schedule.csv`);
    }

    // Etsy
    if (bundleType === "etsy") {
      zip.file("tags.txt", kw.etsyTags.join("\n") + "\n");
      zip.file("materials.txt", "digital download\npdf\nepub\nprintable\nebook\n");
      included.push(`tags.txt (13 Etsy tags), materials.txt`);
    }

    // Manifest LAST (after all included paths are known) + README LAST too
    const manifest = renderManifest(ctx);
    zip.file("metadata.json", JSON.stringify(manifest, null, 2));
    included.unshift(`metadata.json — machine-readable bundle manifest`);

    zip.file("README.md", renderReadme(ctx, included));

    const blob = await zip.generateAsync({ type: "uint8array" });
    await timer.stop("zip", { metadata: { bytes: blob.byteLength } });
    await sc.from("export_jobs").update({ progress: 88 }).eq("id", jobId);

    // ─── Upload + sign ──────────────────────────────────────────────────
    // The path stays under `<userId>/<bookId>/` for RLS, but the file ends
    // with a creator-friendly slug so the download attachment isn't a UUID.
    const filename = bundleFilename(ctx.book, bundleType);
    const path = `${userId}/${bookId}/${jobId}/${filename}`;
    const { error: upErr } = await sc.storage.from("exports").upload(path, blob, {
      contentType: "application/zip", upsert: true,
    });
    if (upErr) throw upErr;
    await timer.stop("upload", { metadata: { path, bytes: blob.byteLength } });

    const { data: signed, error: sErr } = await sc.storage.from("exports")
      .createSignedUrl(path, 60 * 60 * 24 * 7, { download: filename });
    if (sErr) throw sErr;

    await sc.from("export_jobs").update({
      status: "completed", progress: 100,
      result_url: signed.signedUrl,
      result_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      completed_at: new Date().toISOString(),
      metadata: {
        ...(options ?? {}),
        bundle_schema_version: manifest.bundle_schema_version,
        content_sha256: contentHash,
        included_assets: included,
        cover_attached: !!cover,
        epub_attached: !!epubBytes,
        word_count_estimate: manifest.word_count_estimate,
        export_quality_score: audit.score,
        export_quality_status: audit.status,
      },
    }).eq("id", jobId);
    await timer.stop("done");

    await sc.from("storefront_events").insert({
      listing_id: null,
      event_type: `${bundleType}_export_completed`,
      user_id: userId, metadata: { job_id: jobId, book_id: bookId, correlation_id: corr },
    });
    await logPublishEvent(sc, {
      user_id: userId, platform: bundleType, event_type: "publish_completed",
      book_id: bookId, severity: "info", correlation_id: corr,
      message: "bundle ready",
      metadata: {
        job_id: jobId, included: included.length, content_sha256: contentHash,
        cover_attached: !!cover, epub_attached: !!epubBytes,
      },
    });
    await sc.from("creator_notifications").insert({
      user_id: userId,
      kind: "publish_status",
      title: `${PLATFORM_LABEL[bundleType]} bundle is ready`,
      body: `Your ${manifest.word_count_estimate.toLocaleString()}-word bundle has been generated and is ready to download.`,
      link_url: "/account/exports",
      resource_type: "export_job",
      resource_id: jobId,
      metadata: { book_id: bookId, bundle_type: bundleType, score: audit.score },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sc.from("export_jobs").update({
      status: "failed", error_message: msg, error_code: "bundle_failed", completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    await logExportPhase(sc, {
      job_id: jobId, phase: "failed", correlation_id: corr, error_code: "bundle_failed",
      metadata: { error: msg },
    });
    await logFinancialEvent(sc, {
      event_type: "export_job_failed", severity: "warn", actor: "system",
      correlation_id: corr, user_id: userId,
      payload: { job_id: jobId, book_id: bookId, bundle_type: bundleType, error: msg },
    });
    await sc.from("storefront_events").insert({
      event_type: `${bundleType}_export_failed`,
      user_id: userId, metadata: { job_id: jobId, error: msg, correlation_id: corr },
    });
    await logPublishEvent(sc, {
      user_id: userId, platform: bundleType, event_type: "publish_failed",
      book_id: bookId, severity: "error", correlation_id: corr,
      message: msg, metadata: { job_id: jobId },
    });
    await sc.from("creator_notifications").insert({
      user_id: userId,
      kind: "publish_status",
      title: `${PLATFORM_LABEL[bundleType]} bundle failed`,
      body: msg.slice(0, 500),
      link_url: "/account/exports",
      resource_type: "export_job",
      resource_id: jobId,
      metadata: { book_id: bookId, bundle_type: bundleType, error: msg },
    });
  }
}

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  const corr = correlationId(req);

  try {
    const sc = serviceClient();

    const risk = await enforceUserRiskTier(sc, auth.userId, "export");
    if (risk) return risk;

    const burst = await enforcePersistentVelocity(sc, {
      name: "export:user:burst", key: auth.userId, limit: 5, windowSec: 60,
    });
    if (burst) return burst;
    const hourly = await enforcePersistentVelocity(sc, {
      name: "export:user:hour", key: auth.userId, limit: 20, windowSec: 3600,
    });
    if (hourly) return hourly;

    const { data: book } = await sc.from("books").select("user_id").eq("id", parsed.book_id).maybeSingle();
    if (!book || book.user_id !== auth.userId) return unauthorized("Not the owner");

    let entitlementSnapshotId: string | null = null;
    if (EXTERNAL_BUNDLES.has(parsed.bundle_type as BundlePlatform)) {
      const gate = await requireCreatorCapability(sc, auth.userId, "can_publish_external", {
        auditMetadata: { book_id: parsed.book_id, bundle_type: parsed.bundle_type },
        correlationId: corr,
        platform: parsed.bundle_type,
      });
      if (gate.blocked) return gate.blocked;
      const { snapshotEntitlement } = await import("../_shared/entitlements.ts");
      entitlementSnapshotId = await snapshotEntitlement(sc, auth.userId, "export_job", parsed.book_id);
    }

    const { data: job, error } = await sc.from("export_jobs").insert({
      user_id: auth.userId, book_id: parsed.book_id, listing_id: parsed.listing_id ?? null,
      bundle_type: parsed.bundle_type, status: "pending",
      metadata: parsed.options ?? {},
      correlation_id: corr,
      entitlement_snapshot_id: entitlementSnapshotId,
    }).select("id").single();
    if (error || !job) return serverError(error ?? new Error("insert failed"));

    await sc.from("storefront_events").insert({
      listing_id: parsed.listing_id ?? null,
      event_type: `${parsed.bundle_type}_export_started`,
      user_id: auth.userId, metadata: { job_id: job.id, book_id: parsed.book_id, correlation_id: corr },
    });

    await logExportPhase(sc, { job_id: job.id, phase: "enqueued", correlation_id: corr });
    await logPublishEvent(sc, {
      user_id: auth.userId, platform: parsed.bundle_type, event_type: "publish_started",
      book_id: parsed.book_id, listing_id: parsed.listing_id ?? null,
      correlation_id: corr, metadata: { job_id: job.id, kind: "bundle" },
    });

    // @ts-ignore EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runJob(job.id, auth.userId, parsed.book_id, parsed.bundle_type as BundlePlatform, auth.token, parsed.options ?? {}, corr));

    return json({ ok: true, job_id: job.id, correlation_id: corr }, 200, { "x-correlation-id": corr });
  } catch (e) { return serverError(e); }
});
