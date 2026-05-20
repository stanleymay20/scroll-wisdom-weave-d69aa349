import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { preflight, json, badRequest, serverError, unauthorized, requireUser, validateBody, z, serviceClient, enforcePersistentVelocity, enforceUserRiskTier } from "../_shared/http.ts";
import { correlationId, PhaseTimer, logExportPhase, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  book_id: z.string().uuid(),
  bundle_type: z.enum(["kdp", "gumroad"]),
  listing_id: z.string().uuid().optional(),
  options: z.record(z.any()).optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

async function runJob(
  jobId: string, userId: string, bookId: string,
  bundleType: "kdp" | "gumroad", token: string,
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
    const mainPdf = new Uint8Array(await pdfRes.arrayBuffer());
    await timer.stop("pdf", { metadata: { bytes: mainPdf.byteLength } });

    await sc.from("export_jobs").update({ progress: 60 }).eq("id", jobId);

    const zip = new JSZip();
    if (mainPdf) zip.file(bundleType === "kdp" ? "interior.pdf" : "book.pdf", mainPdf);

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
      keywords: listing?.seo_keywords ?? [],
      categories: listing?.seo_categories ?? [],
      backend_keywords: listing?.backend_keywords ?? [],
      license_type: listing?.license_type ?? "personal",
      chapters: chapters?.length ?? 0,
      generated_at: new Date().toISOString(),
      platform: bundleType === "kdp" ? "Amazon KDP" : "Gumroad",
      correlation_id: corr,
    };
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));

    const readme = bundleType === "kdp"
      ? `# Amazon KDP Publishing Bundle\n\nFiles:\n- interior.pdf — Print-ready interior\n- cover.jpg — Front cover\n- metadata.json — Suggested metadata, keywords, categories\n\nUpload interior.pdf and cover.jpg at https://kdp.amazon.com\n`
      : `# Gumroad Publishing Bundle\n\nFiles:\n- book.pdf — Full PDF\n- cover.jpg — Front cover\n- metadata.json — Product copy & keywords\n- license.txt — License terms\n\nUpload at https://app.gumroad.com/products/new\n`;
    zip.file("README.md", readme);

    if (bundleType === "gumroad") {
      const license = `LICENSE\n\nLicense Type: ${listing?.license_type ?? "personal"}\nTitle: ${book?.title ?? ""}\n\nThis copy is licensed for ${listing?.license_type ?? "personal"} use only.\nRedistribution without permission is prohibited.\n`;
      zip.file("license.txt", license);
    }

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
      event_type: bundleType === "kdp" ? "kdp_export_completed" : "gumroad_export_completed",
      user_id: userId, metadata: { job_id: jobId, book_id: bookId, correlation_id: corr },
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
      event_type: bundleType === "kdp" ? "kdp_export_failed" : "gumroad_export_failed",
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
      event_type: parsed.bundle_type === "kdp" ? "kdp_export_started" : "gumroad_export_started",
      user_id: auth.userId, metadata: { job_id: job.id, book_id: parsed.book_id, correlation_id: corr },
    });

    await logExportPhase(sc, { job_id: job.id, phase: "enqueued", correlation_id: corr });

    // @ts-ignore EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runJob(job.id, auth.userId, parsed.book_id, parsed.bundle_type, auth.token, parsed.options ?? {}, corr));

    return json({ ok: true, job_id: job.id, correlation_id: corr }, 200, { "x-correlation-id": corr });
  } catch (e) { return serverError(e); }
});
