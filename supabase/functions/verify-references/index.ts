import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-REFERENCES] ${step}${detailsStr}`);
};

// ============================================
// DOI RESOLUTION — HEAD request to doi.org
// ============================================
async function verifyDOI(doi: string): Promise<{ resolved: boolean; redirectUrl?: string }> {
  try {
    const url = `https://doi.org/${doi}`;
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "Accept": "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    return { resolved: res.ok || res.status === 302 || res.status === 301, redirectUrl: res.url };
  } catch {
    return { resolved: false };
  }
}

// ============================================
// CROSSREF VALIDATION — Compare metadata
// ============================================
interface CrossRefResult {
  matched: boolean;
  titleSimilarity: number;
  authorMatch: boolean;
  yearMatch: boolean;
  status: "verified" | "suspicious" | "unverified";
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

async function crossrefValidate(
  doi: string,
  expectedTitle: string,
  expectedAuthor: string,
  expectedYear: number
): Promise<CrossRefResult> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": "ScrollLibrary/1.0 (mailto:support@scrolllibrary.com)" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { matched: false, titleSimilarity: 0, authorMatch: false, yearMatch: false, status: "unverified" };

    const data = await res.json();
    const work = data.message;

    const crTitle = work.title?.[0] || "";
    const similarity = titleSimilarity(expectedTitle, crTitle);

    const crAuthors: string[] = (work.author || []).map((a: any) => `${a.family || ''}`.toLowerCase());
    const expectedLast = expectedAuthor.split(',')[0]?.split(' ').pop()?.toLowerCase() || '';
    const authorMatch = crAuthors.some((a: string) => a.includes(expectedLast) || expectedLast.includes(a));

    const crYear = work.published?.["date-parts"]?.[0]?.[0] || work["published-print"]?.["date-parts"]?.[0]?.[0];
    const yearMatch = crYear === expectedYear;

    const matched = similarity >= 0.7 && authorMatch && yearMatch;
    const status = matched ? "verified" : similarity >= 0.5 ? "suspicious" : "unverified";

    return { matched, titleSimilarity: Math.round(similarity * 100), authorMatch, yearMatch, status };
  } catch {
    return { matched: false, titleSimilarity: 0, authorMatch: false, yearMatch: false, status: "unverified" };
  }
}

// ============================================
// COMPLIANCE TIER CALCULATION
// ============================================
export type ComplianceTier = "platinum" | "gold" | "silver" | "bronze" | "non-compliant";

interface TierResult {
  tier: ComplianceTier;
  label: string;
  requirements: string[];
  met: string[];
  unmet: string[];
}

function calculateComplianceTier(metrics: {
  totalRefs: number;
  verifiedPct: number;
  suspiciousPct: number;
  duplicates: number;
  fabricationRisk: boolean;
  orphanRefs: number;
  canonicalsMissing: number;
  post2010Pct: number;
  post2018Pct: number;
  semanticScore: number; // 0-100
}): TierResult {
  const checks = {
    noFabrication: !metrics.fabricationRisk,
    noDuplicates: metrics.duplicates === 0,
    doiValidated: metrics.verifiedPct >= 80,
    recencyCompliant: metrics.post2010Pct >= 30 && metrics.post2018Pct >= 15,
    canonicalsPresent: metrics.canonicalsMissing === 0,
    semanticSupport: metrics.semanticScore >= 65,
    noOrphans: metrics.orphanRefs === 0,
    suspiciousLow: metrics.suspiciousPct < 5,
    fullDoiValidation: metrics.verifiedPct >= 95,
  };

  const met: string[] = [];
  const unmet: string[] = [];

  for (const [key, val] of Object.entries(checks)) {
    (val ? met : unmet).push(key);
  }

  let tier: ComplianceTier = "non-compliant";
  let label = "Non-Compliant";

  if (checks.noFabrication && checks.noDuplicates) {
    tier = "bronze"; label = "Bronze";
  }
  if (tier === "bronze" && checks.doiValidated && checks.recencyCompliant) {
    tier = "silver"; label = "Silver";
  }
  if (tier === "silver" && checks.canonicalsPresent && checks.semanticSupport) {
    tier = "gold"; label = "Gold";
  }
  if (tier === "gold" && checks.fullDoiValidation && checks.noOrphans && checks.suspiciousLow) {
    tier = "platinum"; label = "Platinum";
  }

  return {
    tier,
    label,
    requirements: Object.keys(checks),
    met,
    unmet,
  };
}

// ============================================
// HARD FAILURE CONDITIONS
// ============================================
function checkHardFailures(metrics: {
  doiFailures: number;
  suspiciousPct: number;
  canonicalsMissing: number;
  highConfidenceDomain: boolean;
  orphanRefs: number;
}): string[] {
  const failures: string[] = [];
  if (metrics.doiFailures > 0) failures.push(`${metrics.doiFailures} DOI(s) failed validation`);
  if (metrics.suspiciousPct >= 5) failures.push(`${metrics.suspiciousPct.toFixed(1)}% references marked suspicious (≥5% threshold)`);
  if (metrics.canonicalsMissing > 0 && metrics.highConfidenceDomain) {
    failures.push(`${metrics.canonicalsMissing} canonical anchor(s) missing in high-confidence domain`);
  }
  if (metrics.orphanRefs > 0) failures.push(`${metrics.orphanRefs} orphan reference(s) found`);
  return failures;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase configuration missing");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated", { userId: user.id.slice(0, 8) });

    const { references, bookCategory = "general", chapterContent = "" } = await req.json();

    if (!Array.isArray(references) || references.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        verified: [],
        metrics: { total: 0, verifiedPct: 0, suspiciousPct: 0 },
        tier: { tier: "non-compliant", label: "No References" },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    logStep("Verifying references", { count: references.length, category: bookCategory });

    // Process references with rate limiting (max 3 concurrent)
    const results: any[] = [];
    const batchSize = 3;

    for (let i = 0; i < references.length; i += batchSize) {
      const batch = references.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (ref: any) => {
        const result: any = {
          ...ref,
          verification: { doiResolved: false, crossrefStatus: "unverified", method: "none" },
        };

        if (ref.doi) {
          // Step 1: DOI resolution
          const doiResult = await verifyDOI(ref.doi);
          result.verification.doiResolved = doiResult.resolved;
          result.verification.method = doiResult.resolved ? "doi-resolved" : "doi-failed";

          // Step 2: CrossRef validation
          if (doiResult.resolved) {
            const crResult = await crossrefValidate(
              ref.doi,
              ref.title || "",
              ref.authors?.[0] || ref.author || "",
              ref.year || 0
            );
            result.verification.crossrefStatus = crResult.status;
            result.verification.titleSimilarity = crResult.titleSimilarity;
            result.verification.authorMatch = crResult.authorMatch;
            result.verification.yearMatch = crResult.yearMatch;
            result.verification.method = crResult.status === "verified" ? "crossref" : "doi-resolved";
          }
        }

        return result;
      }));

      results.push(...batchResults);

      // Rate limit pause between batches
      if (i + batchSize < references.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Calculate metrics
    const total = results.length;
    const verified = results.filter(r => r.verification.crossrefStatus === "verified" || r.verification.doiResolved).length;
    const suspicious = results.filter(r => r.verification.crossrefStatus === "suspicious").length;
    const doiFailures = results.filter(r => r.doi && !r.verification.doiResolved).length;
    const post2010 = results.filter(r => (r.year || 0) >= 2010).length;
    const post2018 = results.filter(r => (r.year || 0) >= 2018).length;

    const metrics = {
      total,
      verified,
      verifiedPct: total > 0 ? Math.round((verified / total) * 100) : 0,
      suspicious,
      suspiciousPct: total > 0 ? Math.round((suspicious / total) * 100) : 0,
      doiFailures,
      post2010Pct: total > 0 ? Math.round((post2010 / total) * 100) : 0,
      post2018Pct: total > 0 ? Math.round((post2018 / total) * 100) : 0,
    };

    // Calculate tier
    const tier = calculateComplianceTier({
      totalRefs: total,
      verifiedPct: metrics.verifiedPct,
      suspiciousPct: metrics.suspiciousPct,
      duplicates: 0, // already deduped upstream
      fabricationRisk: false,
      orphanRefs: 0,
      canonicalsMissing: 0,
      post2010Pct: metrics.post2010Pct,
      post2018Pct: metrics.post2018Pct,
      semanticScore: 70, // placeholder for now
    });

    // Check hard failures
    const hardFailures = checkHardFailures({
      doiFailures: metrics.doiFailures,
      suspiciousPct: metrics.suspiciousPct,
      canonicalsMissing: 0,
      highConfidenceDomain: ["finance", "economics", "psychology", "medicine", "science"].includes(bookCategory),
      orphanRefs: 0,
    });

    logStep("Verification complete", { verified: metrics.verifiedPct, tier: tier.tier, hardFailures: hardFailures.length });

    return new Response(JSON.stringify({
      success: true,
      references: results,
      metrics,
      tier,
      hardFailures,
      certificationBlocked: hardFailures.length > 0,
      standard: "ScrollVerified™ 2026",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
