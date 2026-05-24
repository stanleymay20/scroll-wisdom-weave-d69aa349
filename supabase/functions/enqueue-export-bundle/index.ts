import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { preflight, json, badRequest, serverError, unauthorized, requireUser, validateBody, z, serviceClient, enforcePersistentVelocity, enforceUserRiskTier } from "../_shared/http.ts";
import { correlationId, PhaseTimer, logExportPhase, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  book_id: z.string().uuid(),
  bundle_type: z.enum(["kdp", "gumroad", "substack", "patreon", "etsy"]),
  listing_id: z.string().uuid().optional(),
  options: z.record(z.any()).optional(),
});

type BundleType = "kdp" | "gumroad" | "substack" | "patreon" | "etsy";

function slugify(s: string) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "chapter";
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const PLATFORM_LABEL: Record<BundleType, string> = {
  kdp: "Amazon KDP",
  gumroad: "Gumroad",
  substack: "Substack",
  patreon: "Patreon",
  etsy: "Etsy",
};

const PLATFORM_URL: Record<BundleType, string> = {
  kdp: "https://kdp.amazon.com",
  gumroad: "https://app.gumroad.com/products/new",
  substack: "https://substack.com/dashboard",
  patreon: "https://www.patreon.com/posts/new",
  etsy: "https://www.etsy.com/your/shops/me/tools/listings",
};

// PDF-emitting platforms reuse export-book; markdown-only platforms skip the PDF call.
const PDF_PLATFORMS: BundleType[] = ["kdp", "gumroad", "etsy"];

async function runJob(
  jobId: string, userId: string, bookId: string,
  bundleType: BundleType, token: string,
  options: Record<string, any>, corr: string,
) {
  const sc = serviceClient();
  const timer = new PhaseTimer(sc, jobId, corr);
  try {
    await sc.from("export_jobs").update({
      status: "running", started_at: new Date().toISOString(), progress: 10, correlation_id: corr,
    }).eq("id", jobId);
    await timer.stop("queued_to_started");

    const { data: book } = await sc.from("books").select("title, description, cover_image_url").eq("id", bookId).maybeSingle();
    const { data: chapters } = await sc.from("chapters").select("chapter_number, title, content").eq("book_id", bookId).order("chapter_number");
    const { data: listing } = await sc.from("public_listings").select("*").eq("book_id", bookId).maybeSingle();
    await timer.stop("fetch_book", { metadata: { chapters: chapters?.length ?? 0 } });

    await sc.from("export_jobs").update({ progress: 30 }).eq("id", jobId);

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

    await sc.from("export_jobs").update({ progress: 60 }).eq("id", jobId);

    const zip = new JSZip();
    if (mainPdf) {
      const pdfName = bundleType === "kdp" ? "interior.pdf"
        : bundleType === "etsy" ? "printable.pdf"
        : "book.pdf";
      zip.file(pdfName, mainPdf);
    }

    if (book?.cover_image_url) {
      try {
        const coverRes = await fetch(book.cover_image_url);
        if (coverRes.ok) zip.file("cover.jpg", new Uint8Array(await coverRes.arrayBuffer()));
      } catch (_) { /* ignore */ }
    }
    await timer.stop("cover");

    const metadata: Record<string, any> = {
      title: book?.title ?? "",
      subtitle: listing?.subtitle ?? "",
      description: listing?.amazon_description ?? book?.description ?? "",
      blurb: listing?.blurb ?? "",
      keywords: listing?.seo_keywords ?? [],
      categories: listing?.seo_categories ?? [],
      backend_keywords: listing?.backend_keywords ?? [],
      license_type: listing?.license_type ?? "personal",
      chapters: chapters?.length ?? 0,
      generated_at: new Date().toISOString(),
      platform: PLATFORM_LABEL[bundleType],
      correlation_id: corr,
    };
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    // Platform-specific assets.
    if (bundleType === "substack") {
      // Chapter-per-post markdown.
      const chDir = zip.folder("chapters")!;
      (chapters ?? []).forEach((c: any) => {
        const fname = `${String(c.chapter_number).padStart(2, "0")}-${slugify(c.title)}.md`;
        chDir.file(fname, `# ${c.title}\n\n${c.content ?? ""}\n`);
      });
      const schedule = (chapters ?? []).map((c: any, i: number) =>
        `Week ${i + 1}: ${c.title}`).join("\n");
      zip.file("publishing-schedule.txt",
        `Suggested weekly cadence for ${book?.title ?? "this serial"}:\n\n${schedule}\n`);
      const welcome = `# Welcome to ${book?.title ?? "the series"}\n\n${listing?.blurb ?? book?.description ?? ""}\n\nNew chapter every week.\n`;
      zip.file("welcome-email.md", welcome);
    }

    if (bundleType === "patreon") {
      // Free preview = sample_chapters; rest = patron-only.
      const sample = Math.max(1, Number(listing?.sample_chapters ?? 1));
      const freeDir = zip.folder("posts-free")!;
      const patronDir = zip.folder("posts-patron-only")!;
      const csvRows: string[] = ["chapter,title,tier,filename"];
      (chapters ?? []).forEach((c: any) => {
        const isFree = c.chapter_number <= sample;
        const dir = isFree ? freeDir : patronDir;
        const tier = isFree ? "Public" : "Patrons";
        const fname = `${String(c.chapter_number).padStart(2, "0")}-${slugify(c.title)}.md`;
        dir.file(fname, `# ${c.title}\n\n${c.content ?? ""}\n`);
        csvRows.push(`${c.chapter_number},"${(c.title ?? "").replace(/"/g, '""')}",${tier},${fname}`);
      });
      zip.file("post-schedule.csv", csvRows.join("\n"));
    }

    if (bundleType === "etsy") {
      // Print-ready PDF (already added) + listing copy + tags.
      const tags = (listing?.seo_keywords ?? []).slice(0, 13);
      const listingCopy =
        `# ${book?.title ?? ""}\n\n${listing?.amazon_description ?? book?.description ?? ""}\n\n` +
        `Tags: ${tags.join(", ")}\n` +
        `License: ${listing?.license_type ?? "personal"}\n`;
      zip.file("etsy-listing.md", listingCopy);
      zip.file("tags.txt", tags.join("\n"));
    }

    // Social caption pack (all platforms).
    const captions = [
      `📚 New release: ${book?.title ?? ""}\n${listing?.blurb ?? ""}\n#books #reading`,
      `Just published ${book?.title ?? ""} — ${listing?.subtitle ?? ""}\nLink in bio.`,
      `If you liked ${listing?.seo_keywords?.[0] ?? "this topic"}, you'll love ${book?.title ?? ""}.`,
    ].join("\n\n---\n\n");
    zip.file("social-captions.txt", captions);

    // License (Gumroad / Etsy explicit).
    if (bundleType === "gumroad" || bundleType === "etsy") {
      const license = `LICENSE\n\nLicense Type: ${listing?.license_type ?? "personal"}\nTitle: ${book?.title ?? ""}\n\nThis copy is licensed for ${listing?.license_type ?? "personal"} use only.\nRedistribution without permission is prohibited.\n`;
      zip.file("license.txt", license);
    }

    const readme = `# ${PLATFORM_LABEL[bundleType]} Publishing Bundle\n\n` +
      `Title: ${book?.title ?? ""}\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      `Upload destination: ${PLATFORM_URL[bundleType]}\n\n` +
      `Inside this bundle:\n` +
      `- metadata.json — title, description, keywords\n` +
      `- cover.jpg — cover image (if available)\n` +
      `- social-captions.txt — ready-to-post promo copy\n` +
      (mainPdf ? `- Print/PDF file\n` : "") +
      (bundleType === "substack" ? `- chapters/ — one markdown file per chapter\n- publishing-schedule.txt\n- welcome-email.md\n` : "") +
      (bundleType === "patreon" ? `- posts-free/ and posts-patron-only/ markdown\n- post-schedule.csv\n` : "") +
      (bundleType === "etsy" ? `- etsy-listing.md, tags.txt, license.txt\n` : "") +
      `\nKDP is never published automatically — always upload manually.\n`;
    zip.file("README.md", readme);

    const blob = await zip.generateAsync({ type: "uint8array" });
    await timer.stop("zip", { metadata: { bytes: blob.byteLength } });

    await sc.from("export_jobs").update({ progress: 85 }).eq("id", jobId);

    const path = `${userId}/${bookId}/${jobId}.zip`;
    const { error: upErr } = await sc.storage.from("exports").upload(path, blob, { contentType: "application/zip", upsert: true });
    if (upErr) throw upErr;
    await timer.stop("upload", { metadata: { path } });

    const { data: signed, error: sErr } = await sc.storage.from("exports").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (sErr) throw sErr;

    await sc.from("export_jobs").update({
      status: "completed", progress: 100,
      result_url: signed.signedUrl,
      result_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    await timer.stop("done");

    await sc.from("storefront_events").insert({
      listing_id: null,
      event_type: `${bundleType}_export_completed`,
      user_id: userId, metadata: { job_id: jobId, book_id: bookId, correlation_id: corr },
    });

    // Phase 3.1 — in-app notification on completion
    await sc.from("creator_notifications").insert({
      user_id: userId,
      kind: "publish_status",
      title: `${bundleType.toUpperCase()} bundle is ready`,
      body: "Your export bundle has been generated and is ready to download.",
      link_url: "/account/exports",
      resource_type: "export_job",
      resource_id: jobId,
      metadata: { book_id: bookId, bundle_type: bundleType },
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

    // Phase 2.1c.2 — risk-tier gate (high/blocked users may not enqueue exports).
    const risk = await enforceUserRiskTier(sc, auth.userId, "export");
    if (risk) return risk;



    // Phase 2.1c.1 — export farming defence.
    // 20 exports per user per hour, and 5 per minute burst cap.
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


    const { data: job, error } = await sc.from("export_jobs").insert({
      user_id: auth.userId, book_id: parsed.book_id, listing_id: parsed.listing_id ?? null,
      bundle_type: parsed.bundle_type, status: "pending",
      metadata: parsed.options ?? {},
      correlation_id: corr,
    }).select("id").single();
    if (error || !job) return serverError(error ?? new Error("insert failed"));

    await sc.from("storefront_events").insert({
      listing_id: parsed.listing_id ?? null,
      event_type: `${parsed.bundle_type}_export_started`,
      user_id: auth.userId, metadata: { job_id: job.id, book_id: parsed.book_id, correlation_id: corr },
    });

    await logExportPhase(sc, { job_id: job.id, phase: "enqueued", correlation_id: corr });

    // @ts-ignore EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runJob(job.id, auth.userId, parsed.book_id, parsed.bundle_type, auth.token, parsed.options ?? {}, corr));

    return json({ ok: true, job_id: job.id, correlation_id: corr }, 200, { "x-correlation-id": corr });
  } catch (e) { return serverError(e); }
});
