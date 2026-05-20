import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { preflight, json, badRequest, serverError, unauthorized, requireUser, validateBody, z, serviceClient } from "../_shared/http.ts";

const Body = z.object({
  book_id: z.string().uuid(),
  bundle_type: z.enum(["kdp", "gumroad"]),
  listing_id: z.string().uuid().optional(),
  options: z.record(z.any()).optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

async function runJob(jobId: string, userId: string, bookId: string, bundleType: "kdp" | "gumroad", token: string, options: Record<string, any>) {
  const sc = serviceClient();
  try {
    await sc.from("export_jobs").update({ status: "running", started_at: new Date().toISOString(), progress: 10 }).eq("id", jobId);

    const { data: book } = await sc.from("books").select("title, description, cover_image_url").eq("id", bookId).maybeSingle();
    const { data: chapters } = await sc.from("chapters").select("chapter_number, title, content").eq("book_id", bookId).order("chapter_number");
    const { data: listing } = await sc.from("public_listings").select("*").eq("book_id", bookId).maybeSingle();

    await sc.from("export_jobs").update({ progress: 30 }).eq("id", jobId);

    // Pull the main PDF from existing export-book function (reuses tested pipeline)
    const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/export-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bookId, format: bundleType === "kdp" ? "kdp-pdf" : "pdf", trimSize: options.trim_size ?? "6x9" }),
    });
    let mainPdf: Uint8Array | null = null;
    if (pdfRes.ok) {
      const buf = await pdfRes.arrayBuffer();
      mainPdf = new Uint8Array(buf);
    }

    await sc.from("export_jobs").update({ progress: 60 }).eq("id", jobId);

    const zip = new JSZip();
    if (mainPdf) zip.file(bundleType === "kdp" ? "interior.pdf" : "book.pdf", mainPdf);

    if (book?.cover_image_url) {
      try {
        const coverRes = await fetch(book.cover_image_url);
        if (coverRes.ok) {
          zip.file("cover.jpg", new Uint8Array(await coverRes.arrayBuffer()));
        }
      } catch (_e) { /* ignore */ }
    }

    // Metadata file
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
    await sc.from("export_jobs").update({ progress: 85 }).eq("id", jobId);

    const path = `${userId}/${bookId}/${jobId}.zip`;
    const { error: upErr } = await sc.storage.from("exports").upload(path, blob, { contentType: "application/zip", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: sErr } = await sc.storage.from("exports").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (sErr) throw sErr;

    await sc.from("export_jobs").update({
      status: "completed", progress: 100,
      result_url: signed.signedUrl,
      result_expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Analytics
    await sc.from("storefront_events").insert({
      listing_id: null,
      event_type: bundleType === "kdp" ? "kdp_export_completed" : "gumroad_export_completed",
      user_id: userId,
      metadata: { job_id: jobId, book_id: bookId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sc.from("export_jobs").update({
      status: "failed", error_message: msg, error_code: "bundle_failed", completed_at: new Date().toISOString(),
    }).eq("id", jobId);
    await sc.from("storefront_events").insert({
      event_type: bundleType === "kdp" ? "kdp_export_failed" : "gumroad_export_failed",
      user_id: userId, metadata: { job_id: jobId, error: msg },
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

  try {
    const sc = serviceClient();
    // Verify ownership
    const { data: book } = await sc.from("books").select("user_id").eq("id", parsed.book_id).maybeSingle();
    if (!book || book.user_id !== auth.userId) return unauthorized("Not the owner");

    const { data: job, error } = await sc.from("export_jobs").insert({
      user_id: auth.userId, book_id: parsed.book_id, listing_id: parsed.listing_id ?? null,
      bundle_type: parsed.bundle_type, status: "pending",
      metadata: parsed.options ?? {},
    }).select("id").single();
    if (error || !job) return serverError(error ?? new Error("insert failed"));

    await sc.from("storefront_events").insert({
      listing_id: parsed.listing_id ?? null,
      event_type: parsed.bundle_type === "kdp" ? "kdp_export_started" : "gumroad_export_started",
      user_id: auth.userId, metadata: { job_id: job.id, book_id: parsed.book_id },
    });

    // @ts-ignore EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runJob(job.id, auth.userId, parsed.book_id, parsed.bundle_type, auth.token, parsed.options ?? {}));

    return json({ ok: true, job_id: job.id });
  } catch (e) { return serverError(e); }
});
