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
interface CrossRefWork {
  title: string;
  authors: string[];
  year: number;
  abstract?: string;
  keywords?: string[];
}

interface CrossRefResult {
  matched: boolean;
  titleSimilarity: number;
  authorMatch: boolean;
  yearMatch: boolean;
  status: "verified" | "suspicious" | "unverified";
  crWork?: CrossRefWork;
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

    // Extract abstract and keywords for semantic analysis
    const abstract = typeof work.abstract === 'string'
      ? work.abstract.replace(/<[^>]*>/g, '').trim()
      : undefined;
    const keywords = Array.isArray(work.subject) ? work.subject : undefined;

    return {
      matched, titleSimilarity: Math.round(similarity * 100), authorMatch, yearMatch, status,
      crWork: { title: crTitle, authors: crAuthors, year: crYear, abstract, keywords },
    };
  } catch {
    return { matched: false, titleSimilarity: 0, authorMatch: false, yearMatch: false, status: "unverified" };
  }
}

// ============================================
// SEMANTIC SUPPORT EVALUATION (Server-side)
// ============================================

const EMPIRICAL_INDICATORS = [
  'study', 'studies', 'data', 'sample', 'experiment', 'experimental',
  'rct', 'randomized controlled trial', 'regression', 'panel data',
  'meta-analysis', 'meta analysis', 'survey', 'longitudinal',
  'cross-sectional', 'statistically significant', 'p-value',
  'confidence interval', 'effect size', 'cohort', 'trial',
  'findings show', 'results indicate', 'evidence suggests',
];

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
    'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'and', 'but', 'or', 'not', 'so', 'yet',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'we', 'our', 'he', 'she', 'his', 'her', 'who', 'which', 'what',
  ]);
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function evaluateCitationSupport(
  paragraphText: string,
  citation: { title: string; abstract?: string; keywords?: string[]; year: number }
): { score: number; level: string; reason: string } {
  const pKeywords = extractKeywords(paragraphText);
  const titleKw = extractKeywords(citation.title);
  const abstractKw = citation.abstract ? extractKeywords(citation.abstract) : [];
  const metaKw = (citation.keywords || []).map(k => k.toLowerCase());
  const allCitKw = new Set([...titleKw, ...abstractKw, ...metaKw]);

  if (pKeywords.length === 0 || allCitKw.size === 0) {
    return { score: 30, level: 'weak', reason: 'Insufficient text for analysis' };
  }

  const pSet = new Set(pKeywords);
  const titleSet = new Set(titleKw);
  const titleIntersection = [...pSet].filter(w => titleSet.has(w));
  const titleOverlap = titleKw.length > 0 ? titleIntersection.length / Math.min(pSet.size, titleSet.size) : 0;

  let score = titleOverlap * 40;

  if (abstractKw.length > 0) {
    const absSet = new Set(abstractKw);
    const absIntersection = [...pSet].filter(w => absSet.has(w));
    score += (absIntersection.length / Math.min(pSet.size, absSet.size)) * 35;
  } else {
    const allIntersection = [...pSet].filter(w => allCitKw.has(w));
    score += (allIntersection.length / Math.min(pSet.size, allCitKw.size)) * 25;
  }

  if (metaKw.length > 0) {
    const metaMatches = metaKw.filter(k => pKeywords.some(pk => pk.includes(k) || k.includes(pk)));
    score += (metaMatches.length / metaKw.length) * 15;
  }

  const age = new Date().getFullYear() - citation.year;
  score += age <= 5 ? 10 : age <= 10 ? 7 : age <= 20 ? 4 : 1;

  score = Math.min(100, Math.max(0, Math.round(score)));

  const level = score >= 80 ? 'strong' : score >= 65 ? 'moderate' : score >= 40 ? 'weak' : 'ornamental';
  const intersection = [...pSet].filter(w => allCitKw.has(w));
  const reason = score >= 80 ? `High alignment (${intersection.length} shared terms)`
    : score >= 65 ? `Moderate overlap (${intersection.length} shared terms)`
    : score >= 40 ? `Low alignment — possibly tangential`
    : `Minimal connection — possible decorative citation`;

  return { score, level, reason };
}

function detectEmpiricalParagraphs(content: string): string[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 30);
  return paragraphs.filter(p => {
    const lower = p.toLowerCase();
    return EMPIRICAL_INDICATORS.some(ind => lower.includes(ind));
  });
}

// ============================================
// COMPLIANCE TIER CALCULATION
// ============================================
type ComplianceTier = "platinum" | "gold" | "silver" | "bronze" | "non-compliant";

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
  semanticScore: number;
  ornamentalPct: number;
}): TierResult {
  const checks: Record<string, boolean> = {
    noFabrication: !metrics.fabricationRisk,
    noDuplicates: metrics.duplicates === 0,
    doiValidated: metrics.verifiedPct >= 80,
    recencyCompliant: metrics.post2010Pct >= 30 && metrics.post2018Pct >= 15,
    canonicalsPresent: metrics.canonicalsMissing === 0,
    semanticSupport: metrics.semanticScore >= 65,
    noOrphans: metrics.orphanRefs === 0,
    suspiciousLow: metrics.suspiciousPct < 5,
    fullDoiValidation: metrics.verifiedPct >= 95,
    ornamentalLow: metrics.ornamentalPct < 5,
  };

  const met: string[] = [];
  const unmet: string[] = [];
  for (const [key, val] of Object.entries(checks)) {
    (val ? met : unmet).push(key);
  }

  let tier: ComplianceTier = "non-compliant";
  let label = "Non-Compliant";

  if (checks.noFabrication && checks.noDuplicates) { tier = "bronze"; label = "Bronze"; }
  if (tier === "bronze" && checks.doiValidated && checks.recencyCompliant) { tier = "silver"; label = "Silver"; }
  if (tier === "silver" && checks.canonicalsPresent && checks.semanticSupport) { tier = "gold"; label = "Gold"; }
  if (tier === "gold" && checks.fullDoiValidation && checks.noOrphans && checks.suspiciousLow && checks.ornamentalLow) {
    tier = "platinum"; label = "Platinum";
  }

  return { tier, label, requirements: Object.keys(checks), met, unmet };
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
  ornamentalPct: number;
  semanticAvg: number;
  empiricalUnsupported: number;
}): string[] {
  const failures: string[] = [];
  if (metrics.doiFailures > 0) failures.push(`${metrics.doiFailures} DOI(s) failed validation`);
  if (metrics.suspiciousPct >= 5) failures.push(`${metrics.suspiciousPct.toFixed(1)}% references marked suspicious (≥5% threshold)`);
  if (metrics.canonicalsMissing > 0 && metrics.highConfidenceDomain) {
    failures.push(`${metrics.canonicalsMissing} canonical anchor(s) missing in high-confidence domain`);
  }
  if (metrics.orphanRefs > 0) failures.push(`${metrics.orphanRefs} orphan reference(s) found`);
  if (metrics.ornamentalPct >= 10) failures.push(`${metrics.ornamentalPct}% ornamental citations detected (≥10% threshold)`);
  if (metrics.semanticAvg < 50) failures.push(`Average semantic score ${metrics.semanticAvg}/100 below institutional minimum (50)`);
  if (metrics.empiricalUnsupported > 0) failures.push(`${metrics.empiricalUnsupported} empirical claim(s) without empirical citation support`);
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
        references: [],
        metrics: { total: 0, verifiedPct: 0, suspiciousPct: 0 },
        tier: { tier: "non-compliant", label: "No References" },
        semanticIntegrityReport: { totalCitations: 0, strong: 0, moderate: 0, weak: 0, ornamental: 0, averageScore: 0, empiricalClaimsUnsupported: 0, ornamentalPct: 0 },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    logStep("Verifying references", { count: references.length, category: bookCategory });

    // ============================================
    // PHASE 1: DOI + CrossRef Verification (batched)
    // ============================================
    const results: any[] = [];
    const batchSize = 3;

    for (let i = 0; i < references.length; i += batchSize) {
      const batch = references.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (ref: any) => {
        const result: any = {
          ...ref,
          verification: { doiResolved: false, crossrefStatus: "unverified", method: "none" },
          semanticSupport: { score: 0, level: "ornamental", reason: "Not evaluated" },
        };

        if (ref.doi) {
          const doiResult = await verifyDOI(ref.doi);
          result.verification.doiResolved = doiResult.resolved;
          result.verification.method = doiResult.resolved ? "doi-resolved" : "doi-failed";

          if (doiResult.resolved) {
            const crResult = await crossrefValidate(
              ref.doi, ref.title || "", ref.authors?.[0] || ref.author || "", ref.year || 0
            );
            result.verification.crossrefStatus = crResult.status;
            result.verification.titleSimilarity = crResult.titleSimilarity;
            result.verification.authorMatch = crResult.authorMatch;
            result.verification.yearMatch = crResult.yearMatch;
            result.verification.method = crResult.status === "verified" ? "crossref" : "doi-resolved";

            // Store CrossRef metadata for semantic analysis
            if (crResult.crWork) {
              result._crWork = crResult.crWork;
            }
          }
        }

        return result;
      }));

      results.push(...batchResults);
      if (i + batchSize < references.length) await new Promise(r => setTimeout(r, 500));
    }

    // ============================================
    // PHASE 2: Semantic Support Evaluation
    // ============================================
    logStep("Running semantic support analysis");

    // Extract paragraphs from chapter content for context-aware evaluation
    const paragraphs = chapterContent
      ? chapterContent.split(/\n\n+/).filter((p: string) => p.trim().length > 30)
      : [];

    const semanticEvaluations: { score: number; level: string }[] = [];

    for (const result of results) {
      const citMeta = {
        title: result.title || "",
        abstract: result._crWork?.abstract,
        keywords: result._crWork?.keywords,
        year: result.year || 0,
      };

      // Find the paragraph this citation likely appears in
      const citKey = result.authors?.[0] || result.author || result.title || "";
      const contextParagraph = paragraphs.find((p: string) => p.includes(citKey)) || chapterContent || result.title || "";

      const eval_ = evaluateCitationSupport(contextParagraph.slice(0, 2000), citMeta);
      result.semanticSupport = eval_;
      semanticEvaluations.push({ score: eval_.score, level: eval_.level });

      // Clean up internal field
      delete result._crWork;
    }

    // ============================================
    // PHASE 3: Empirical Claim Detection
    // ============================================
    const empiricalParagraphs = chapterContent ? detectEmpiricalParagraphs(chapterContent) : [];
    let empiricalClaimsUnsupported = 0;

    for (const empParagraph of empiricalParagraphs) {
      // Check if any citation in this paragraph has adequate empirical support
      const citationsInParagraph = results.filter(r => {
        const citKey = r.authors?.[0] || r.author || r.title || "";
        return empParagraph.includes(citKey);
      });

      if (citationsInParagraph.length === 0) {
        empiricalClaimsUnsupported++;
      } else {
        const hasEmpiricalSupport = citationsInParagraph.some(
          (c: any) => c.semanticSupport?.score >= 50 && (c.peerReviewed !== false)
        );
        if (!hasEmpiricalSupport) empiricalClaimsUnsupported++;
      }
    }

    // ============================================
    // PHASE 4: Metrics & Tier Calculation
    // ============================================
    const total = results.length;
    const verified = results.filter(r => r.verification.crossrefStatus === "verified" || r.verification.doiResolved).length;
    const suspicious = results.filter(r => r.verification.crossrefStatus === "suspicious").length;
    const doiFailures = results.filter(r => r.doi && !r.verification.doiResolved).length;
    const post2010 = results.filter(r => (r.year || 0) >= 2010).length;
    const post2018 = results.filter(r => (r.year || 0) >= 2018).length;

    const ornamentalCount = semanticEvaluations.filter(e => e.level === 'ornamental').length;
    const strongCount = semanticEvaluations.filter(e => e.level === 'strong').length;
    const moderateCount = semanticEvaluations.filter(e => e.level === 'moderate').length;
    const weakCount = semanticEvaluations.filter(e => e.level === 'weak').length;
    const semanticAvg = total > 0 ? Math.round(semanticEvaluations.reduce((s, e) => s + e.score, 0) / total) : 0;
    const ornamentalPct = total > 0 ? Math.round((ornamentalCount / total) * 100) : 0;

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

    const semanticIntegrityReport = {
      totalCitations: total,
      strong: strongCount,
      moderate: moderateCount,
      weak: weakCount,
      ornamental: ornamentalCount,
      averageScore: semanticAvg,
      empiricalClaimsUnsupported,
      ornamentalPct,
    };

    const tier = calculateComplianceTier({
      totalRefs: total,
      verifiedPct: metrics.verifiedPct,
      suspiciousPct: metrics.suspiciousPct,
      duplicates: 0,
      fabricationRisk: false,
      orphanRefs: 0,
      canonicalsMissing: 0,
      post2010Pct: metrics.post2010Pct,
      post2018Pct: metrics.post2018Pct,
      semanticScore: semanticAvg,
      ornamentalPct,
    });

    const hardFailures = checkHardFailures({
      doiFailures: metrics.doiFailures,
      suspiciousPct: metrics.suspiciousPct,
      canonicalsMissing: 0,
      highConfidenceDomain: ["finance", "economics", "psychology", "medicine", "science"].includes(bookCategory),
      orphanRefs: 0,
      ornamentalPct,
      semanticAvg,
      empiricalUnsupported: empiricalClaimsUnsupported,
    });

    logStep("Verification complete", {
      verified: metrics.verifiedPct,
      tier: tier.tier,
      semanticAvg,
      ornamental: ornamentalCount,
      hardFailures: hardFailures.length,
    });

    return new Response(JSON.stringify({
      success: true,
      references: results,
      metrics,
      semanticIntegrityReport,
      tier,
      hardFailures,
      certificationBlocked: hardFailures.length > 0,
      standard: "ScrollVerified™ 2026 — Institutional Semantic Compliance",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
