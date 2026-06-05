// One-click external publish orchestration.
//
// The publish-to-X edge function only creates the upstream product — it
// requires the creator to manually drop the downloadable bundle into the
// upstream edit page afterwards (Gumroad's v2 API doesn't accept file
// attachments; Shopify needs the Digital Downloads app). To make the flow
// genuinely one-click, the client first guarantees a fresh export bundle is
// ready, *then* creates the upstream product with `export_job_id` pointing
// at that bundle so the response carries a `bundle_hint` URL the user can
// hand straight to the upstream merchant.
//
// Contract:
//   1. Quality audit — refuse to publish a book with blockers.
//   2. Bundle lookup — find the most recent completed export bundle for this
//      book on this platform (≤ 24h old, schema v2+).
//   3. If stale/missing → enqueue a new bundle and return `{ status: "bundling" }`
//      with the job_id. Caller polls for completion and re-invokes us.
//   4. If fresh → call publish-to-X with that job's id and return the
//      upstream product URLs.
import { supabase } from "@/integrations/supabase/client";
import {
  type DirectPublishResult, publishToGumroad, publishToShopify, type PlatformId,
} from "@/lib/platformConnections";
import { parseBookToCanonical } from "@/lib/canonicalContent";
import { auditBookForExport, type ExportQualityReport } from "@/lib/exportQuality";

export type OneClickStatus =
  | "blocked"        // export quality refused (structural / content blockers)
  | "unsafe"         // sell-safety verifier rejected for this platform
  | "not_connected"  // upstream platform not connected (caller routes to connect)
  | "bundling"       // bundle job queued; caller should poll job_id
  | "published"      // upstream product created (idempotent or fresh)
  | "failed";        // hard failure

export interface OneClickResult {
  status: OneClickStatus;
  /** Set when status === "bundling". Caller polls export_jobs(job_id). */
  job_id?: string;
  /** Set when status === "blocked". */
  quality?: ExportQualityReport;
  /** Set when status === "published". */
  publish?: DirectPublishResult;
  /** Human-friendly message safe to show in a toast. */
  message?: string;
  /** Support correlation id when available. */
  correlation_id?: string;
}

interface OneClickOptions {
  /** Force a new bundle even if a recent one exists. Default false. */
  forceFreshBundle?: boolean;
  /** Bundle freshness window. Default 24h. */
  maxBundleAgeMs?: number;
  /** Bundle schema version floor. Default "2.0.0". */
  minBundleSchemaVersion?: string;
}

const DEFAULTS: Required<OneClickOptions> = {
  forceFreshBundle: false,
  maxBundleAgeMs: 24 * 60 * 60 * 1000,
  minBundleSchemaVersion: "2.0.0",
};

/**
 * Resolve the most recent completed bundle export for a (book, platform).
 * Returns null when none exists, is stale, or pre-dates the schema floor.
 */
async function findFreshBundle(
  bookId: string,
  platform: PlatformId,
  opts: Required<OneClickOptions>,
): Promise<{ id: string; created_at: string } | null> {
  if (opts.forceFreshBundle) return null;
  const { data } = await supabase
    .from("export_jobs")
    .select("id, created_at, completed_at, metadata, status")
    .eq("book_id", bookId)
    .eq("bundle_type", platform)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);
  const j = data?.[0];
  if (!j) return null;
  const completedAt = j.completed_at ?? j.created_at;
  if (Date.now() - new Date(completedAt).getTime() > opts.maxBundleAgeMs) return null;
  const ver = (j.metadata as any)?.bundle_schema_version as string | undefined;
  if (!ver || cmpSemver(ver, opts.minBundleSchemaVersion) < 0) return null;
  return { id: j.id, created_at: completedAt };
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? 0, bv = pb[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

async function loadQualityReport(bookId: string): Promise<ExportQualityReport | null> {
  const [{ data: book }, { data: chapters }, { data: listing }] = await Promise.all([
    supabase.from("books").select("cover_image_url, book_type").eq("id", bookId).maybeSingle(),
    supabase.from("chapters").select("chapter_number, title, content").eq("book_id", bookId).order("chapter_number"),
    supabase.from("public_listings").select("cover_override_url").eq("book_id", bookId).maybeSingle(),
  ]);
  if (!chapters) return null;
  const canonical = parseBookToCanonical(chapters);
  return auditBookForExport(canonical, {
    hasCover: !!(book?.cover_image_url || (listing as any)?.cover_override_url),
    bookType: book?.book_type ?? null,
  });
}

async function enqueueBundle(bookId: string, listingId: string, platform: PlatformId): Promise<string> {
  const { data, error } = await supabase.functions.invoke("enqueue-export-bundle", {
    body: { book_id: bookId, bundle_type: platform, listing_id: listingId, options: {} },
  });
  if (error) throw error;
  const jobId = (data as any)?.job_id;
  if (!jobId) throw new Error("No job_id returned from enqueue-export-bundle");
  return jobId as string;
}

export async function publishExternallyOneClick(
  listingId: string,
  bookId: string,
  platform: PlatformId,
  options: OneClickOptions = {},
): Promise<OneClickResult> {
  const opts = { ...DEFAULTS, ...options };

  // 0) Already-live short-circuit. publish-to-X is idempotent and returns
  //    immediately when an external_publications row in 'live' state exists,
  //    but waking the bundle pipeline just to discover this is wasteful and
  //    racy with the rate limiter (each one-click click consumes a publish
  //    velocity token). Detect the steady state on the client.
  if (!opts.forceFreshBundle) {
    const { data: existing } = await supabase
      .from("external_publications")
      .select("external_url, external_id, status, sync_state")
      .eq("book_id", bookId).eq("platform", platform).maybeSingle();
    if (existing && existing.status === "live" && existing.external_id) {
      return {
        status: "published",
        publish: {
          ok: true, idempotent: true,
          external_url: existing.external_url ?? undefined,
          external_id: existing.external_id ?? undefined,
        },
        message: `Already live on ${platform === "gumroad" ? "Gumroad" : "Shopify"}.`,
      };
    }
  }

  // 1) Quality gate
  const report = await loadQualityReport(bookId);
  if (report?.status === "blocked") {
    return {
      status: "blocked",
      quality: report,
      message: `Resolve ${report.issues.filter((i) => i.severity === "blocker").length} blocker${report.issues.length === 1 ? "" : "s"} before publishing.`,
    };
  }

  // 2) Bundle lookup
  const bundle = await findFreshBundle(bookId, platform, opts);
  if (!bundle) {
    try {
      const jobId = await enqueueBundle(bookId, listingId, platform);
      return {
        status: "bundling",
        job_id: jobId,
        message: `Preparing your ${platform === "gumroad" ? "Gumroad" : "Shopify"} bundle. We'll publish as soon as it's ready.`,
      };
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (/entitlement|creator|402/i.test(m)) {
        return { status: "failed", message: "Upgrade to Creator to publish externally." };
      }
      return { status: "failed", message: m || "Could not queue the bundle." };
    }
  }

  // 3) Direct publish
  try {
    const publish = platform === "gumroad"
      ? await publishToGumroad(listingId, bundle.id)
      : await publishToShopify(listingId, bundle.id);
    return {
      status: "published",
      publish,
      correlation_id: (publish as any)?.correlation_id,
      message: publish.idempotent
        ? `Already published to ${platform === "gumroad" ? "Gumroad" : "Shopify"}.`
        : `Published to ${platform === "gumroad" ? "Gumroad" : "Shopify"}.`,
    };
  } catch (e: any) {
    const m = String(e?.message ?? "");
    if (/sell_safety_blocked/i.test(m)) {
      // The edge function refused on policy — surface the specific reason.
      return { status: "unsafe", message: m.replace(/^[^:]*:\s*/, "") || `${platform} safety check failed.` };
    }
    if (/not_connected/i.test(m)) return { status: "not_connected", message: `Connect ${platform === "gumroad" ? "Gumroad" : "Shopify"} first.` };
    if (/expired|revoked/i.test(m)) return { status: "not_connected", message: `${platform === "gumroad" ? "Gumroad" : "Shopify"} connection expired — reconnect.` };
    if (/entitlement|402/i.test(m)) return { status: "failed", message: "Upgrade to Creator to publish externally." };
    return { status: "failed", message: m || "Publish failed." };
  }
}

/**
 * Poll a bundle export job until it reaches a terminal state.
 * Resolves with the final job row. Throws on hard timeout.
 */
export async function waitForBundle(jobId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<{
  status: "completed" | "failed";
  result_url: string | null;
  error_message: string | null;
  progress: number;
}> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const startedAt = Date.now();
  // First poll is immediate; subsequent ones wait `intervalMs`.
  // We never spin tighter than 1.5s to stay polite to the realtime gateway.
  while (true) {
    const { data, error } = await supabase
      .from("export_jobs")
      .select("status, result_url, error_message, progress")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Bundle job not found");
    if (data.status === "completed" || data.status === "failed") {
      return {
        status: data.status,
        result_url: data.result_url ?? null,
        error_message: data.error_message ?? null,
        progress: data.progress ?? 100,
      };
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Bundle build timed out");
    }
    await new Promise((r) => setTimeout(r, Math.max(intervalMs, 1500)));
  }
}
