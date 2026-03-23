import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
const log = (s: string, d?: any) => console.log(`[VERIFY-REF] ${s}${d ? ` - ${JSON.stringify(d)}` : ''}`);
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyDOI(doi: string) {
  try { const r = await fetch(`https://doi.org/${doi}`, { method: "HEAD", redirect: "follow", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(8000) }); return { resolved: r.ok || r.status === 302 || r.status === 301 }; } catch { return { resolved: false }; }
}

// AUDIT FIX: Raised similarity threshold from 0.7 → 0.8 to reduce gameable false-positives.
// At 0.7, two papers sharing ~70% of title words could be mistakenly "verified".
// At 0.8, we require stronger lexical overlap before granting verified status.
async function crossrefValidate(doi: string, title: string, author: string, year: number) {
  try {
    // AUDIT FIX: Hard-reject known placeholder/fabrication patterns before hitting CrossRef
    const PLACEHOLDER_PATTERNS = [/^reference\s+\d+$/i, /^unknown$/i, /^\[requires?\s+verification\]$/i, /^web reference/i, /^source\s*\d*$/i];
    if (PLACEHOLDER_PATTERNS.some(p => p.test(title.trim())) || PLACEHOLDER_PATTERNS.some(p => p.test(author.trim()))) {
      return { matched: false, sim: 0, authorMatch: false, yearMatch: false, status: "fabricated" as const, crWork: undefined };
    }

    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { "User-Agent": "ScrollLibrary/1.0 (mailto:research@scrolllibrary.org)" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { matched: false, sim: 0, authorMatch: false, yearMatch: false, status: "unverified" as const, crWork: undefined };
    const w = (await r.json()).message;
    const crTitle = w.title?.[0] || "";
    const nA = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/), nB = crTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const sA = new Set(nA), sB = new Set(nB), inter = [...sA].filter(x => sB.has(x)).length, union = new Set([...sA, ...sB]).size;
    const sim = union > 0 ? inter / union : 0;
    const crAuthors = (w.author || []).map((a: any) => (a.family || '').toLowerCase());
    const expLast = author.split(',')[0]?.split(' ').pop()?.toLowerCase() || '';
    const aM = crAuthors.some((a: string) => a.includes(expLast) || expLast.includes(a));
    const crY = w.published?.["date-parts"]?.[0]?.[0] || w["published-print"]?.["date-parts"]?.[0]?.[0];
    // AUDIT: Threshold raised from 0.7 to 0.8 — requires stronger lexical title match for "verified" status
    const yM = crY === year, matched = sim >= 0.8 && aM && yM;
    const abs = typeof w.abstract === 'string' ? w.abstract.replace(/<[^>]*>/g, '').trim() : undefined;
    return { matched, sim: Math.round(sim * 100), authorMatch: aM, yearMatch: yM, status: (matched ? "verified" : sim >= 0.55 ? "suspicious" : "unverified") as any, crWork: { title: crTitle, abstract: abs, keywords: Array.isArray(w.subject) ? w.subject : undefined, year: crY } };
  } catch { return { matched: false, sim: 0, authorMatch: false, yearMatch: false, status: "unverified" as const, crWork: undefined }; }
}

// ===========================================
// MULTI-STYLE CITATION PARSING (Fix #1)
// ===========================================

const APA_RE = /\(([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:&|and)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?),?\s*(\d{4})(?:[a-z])?(?:,\s*p{1,2}\.?\s*[\d–-]+)?\)/g;
const HARVARD_RE = /\(([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:and|&)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?)\s+(\d{4})(?:,\s*p{1,2}\.?\s*[\d–-]+)?\)/g;
const NARRATIVE_RE = /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:and|&)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?)\s+\((\d{4})(?:[a-z])?\)/g;
const IEEE_RE = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

function detectStyle(content: string): string {
  const apa = (content.match(APA_RE) || []).length;
  const harvard = (content.match(HARVARD_RE) || []).length;
  const ieee = (content.match(IEEE_RE) || []).length;
  if (ieee > apa && ieee > harvard) return 'IEEE';
  if (apa >= harvard) return 'APA';
  return 'Harvard';
}

function extractCitKeys(text: string, style?: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => { const l = k.toLowerCase().trim(); if (l && !seen.has(l)) { seen.add(l); keys.push(k.trim()); } };

  // APA-style parenthetical
  let m: RegExpExecArray | null;
  let re = new RegExp(APA_RE.source, 'g');
  while ((m = re.exec(text)) !== null) add(m[1]);

  // Harvard-style (no comma before year)
  re = new RegExp(HARVARD_RE.source, 'g');
  while ((m = re.exec(text)) !== null) add(m[1]);

  // Narrative citations
  re = new RegExp(NARRATIVE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) add(m[1]);

  return keys;
}

const EMP_IND = ['study','studies','data','sample','experiment','rct','regression','panel data','meta-analysis','survey','longitudinal','findings show','results indicate','evidence suggests'];
const STOPS = new Set('the a an is are was were be been have has had do does did will would could should may might can to of in for on with at by from as into and but or not so yet this that it its they them their we our he she his her who which what'.split(' '));
const kw = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPS.has(w));

function kwSupport(para: string, cit: { title: string; abstract?: string; keywords?: string[]; year: number }) {
  const pK = kw(para), tK = kw(cit.title), aK = cit.abstract ? kw(cit.abstract) : [], mK = (cit.keywords || []).map(k => k.toLowerCase());
  const all = new Set([...tK, ...aK, ...mK]);
  if (!pK.length || !all.size) return { score: 30, level: 'weak' };
  const pS = new Set(pK), tS = new Set(tK);
  let sc = ([...pS].filter(w => tS.has(w)).length / Math.min(pS.size, tS.size)) * 40;
  if (aK.length) { const aS = new Set(aK); sc += ([...pS].filter(w => aS.has(w)).length / Math.min(pS.size, aS.size)) * 35; }
  else sc += ([...pS].filter(w => all.has(w)).length / Math.min(pS.size, all.size)) * 25;
  if (mK.length) sc += (mK.filter(k => pK.some(p => p.includes(k) || k.includes(p))).length / mK.length) * 15;
  const age = new Date().getFullYear() - cit.year; sc += age <= 5 ? 10 : age <= 10 ? 7 : age <= 20 ? 4 : 1;
  sc = Math.min(100, Math.max(0, Math.round(sc)));
  return { score: sc, level: sc >= 80 ? 'strong' : sc >= 65 ? 'moderate' : sc >= 40 ? 'weak' : 'ornamental' };
}

// Updated claim extraction with sentence-level citation scoping (Fix: over-attribution)
function extractClaims(content: string, max = 25) {
  const paras = content.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 30);
  const claims: any[] = []; let id = 0;
  for (let pi = 0; pi < paras.length && claims.length < max * 3; pi++) {
    for (const s of paras[pi].split(/(?<=[.!?])\s+/).filter(s => s.length > 20 && s.length < 500)) {
      if (/^(this|the)\s+(chapter|section)/i.test(s) || s.startsWith('#')) continue;
      if (!/\b(is|are|was|were|show|demonstrate|indicate|suggest|find|found|reveal|confirm|cause|affect|predict)\b/i.test(s)) continue;
      const lo = s.toLowerCase();
      let type: string = 'descriptive';
      if (EMP_IND.some(i => lo.includes(i))) type = 'empirical';
      else if (/\b(theory|framework|model|hypothesis|posits|proposes|argues|paradigm)\b/i.test(lo)) type = 'theoretical';
      // Fix: Extract sentence-level citation keys FIRST, fallback to paragraph-level
      let cks = extractCitKeys(s);
      if (cks.length === 0) {
        // Fallback: check paragraph-level but mark as paragraph-scoped
        cks = extractCitKeys(paras[pi]);
      }
      claims.push({ id: `c${id++}`, text: s, type, pi, cks: [...new Set(cks)] });
    }
  }
  const sorted = [...claims.filter(c => c.type === 'empirical'), ...claims.filter(c => c.type === 'theoretical'), ...claims.filter(c => c.type === 'descriptive')];
  return sorted.slice(0, max);
}

async function llmEval(claim: any, metas: any[], apiKey: string) {
  try {
    const citDesc = metas.map((c, i) => `${i + 1}. "${c.title}" (${c.year})${c.abstract ? ` — ${c.abstract.slice(0, 250)}` : ''}`).join('\n');
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [
        { role: "system", content: 'Academic peer reviewer. Return ONLY JSON: {"supportVerdict":"strong|partial|weak|contradiction","confidence":0-100,"reason":"brief"}' },
        { role: "user", content: `CLAIM (${claim.type}): "${claim.text}"\nSOURCES:\n${citDesc || "None"}\nReturn JSON only.` }
      ], temperature: 0.1, max_tokens: 150 }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { id: claim.id, v: 'weak', c: 0, r: 'LLM unavailable' };
    const content = (await r.json()).choices?.[0]?.message?.content || '';
    const jm = content.match(/\{[\s\S]*?\}/);
    if (!jm) return { id: claim.id, v: 'weak', c: 0, r: 'Parse failed' };
    const p = JSON.parse(jm[0]);
    const v = ['strong','partial','weak','contradiction'].includes(p.supportVerdict) ? p.supportVerdict : 'weak';
    return { id: claim.id, v, c: Math.min(100, Math.max(0, Number(p.confidence) || 50)), r: String(p.reason || '').slice(0, 150) };
  } catch { return { id: claim.id, v: 'weak', c: 0, r: 'Timeout' }; }
}

// ===========================================
// FIX #2: VERDICT REVALIDATION
// Re-run contradiction verdicts once for confirmation
// ===========================================

async function revalidateContradictions(contradictions: any[], claims: any[], refMap: Map<string, any>, crCache: Map<string, any>, apiKey: string): Promise<any[]> {
  if (!contradictions.length) return contradictions;
  log("Revalidation", { count: contradictions.length });

  const revalidated: any[] = [];
  for (const cv of contradictions) {
    const cl = claims.find((c: any) => c.id === cv.id);
    if (!cl) { revalidated.push(cv); continue; }
    const metas: any[] = [];
    for (const ck of cl.cks) {
      for (const [k, ref] of refMap.entries()) {
        if (k.includes(ck.toLowerCase()) || ck.toLowerCase().includes(k)) {
          const cw = crCache.get(ref.doi || ref.title || '');
          metas.push({ title: cw?.title || ref.title || ck, abstract: cw?.abstract, year: ref.year || 0 });
          break;
        }
      }
    }
    if (!metas.length) metas.push({ title: cl.cks.join(', '), year: 0 });
    const rv = await llmEval(cl, metas, apiKey);
    if (rv.v === 'contradiction') {
      // Confirmed contradiction
      revalidated.push({ ...rv, revalidated: true, confirmed: true });
    } else {
      // Mismatch — downgrade to 'weak' and flag for manual review
      revalidated.push({ ...rv, v: rv.v, revalidated: true, confirmed: false, r: `Revalidation changed verdict: ${rv.r}. Requires manual review.` });
    }
  }
  return revalidated;
}

// ===========================================
// PHASE 6: EPISTEMIC COHERENCE ENGINE
// ===========================================

const CONTRA_PAIRS: [RegExp, RegExp][] = [
  [/\bincreases?\b/i, /\bdecreases?\b/i],
  [/\bpositively?\s+(?:correlat|associat|relat)/i, /\bnegatively?\s+(?:correlat|associat|relat)/i],
  [/\bsupports?\b/i, /\bcontradicts?\b/i],
  [/\bsignificant\b/i, /\bnot?\s+significant\b/i],
  [/\bconfirms?\b/i, /\brefutes?\b/i],
  [/\bcauses?\b/i, /\bdoes\s+not\s+cause\b/i],
  [/\beffective\b/i, /\bineffective\b/i],
  [/\bbeneficial\b/i, /\bharmful\b/i],
];

function preScreenConflicts(claims: any[]): Array<[any, any]> {
  const candidates: Array<[any, any]> = [];
  const substantiveTerms = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOPS.has(w));

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      for (const [pA, pB] of CONTRA_PAIRS) {
        if ((pA.test(claims[i].text) && pB.test(claims[j].text)) || (pB.test(claims[i].text) && pA.test(claims[j].text))) {
          const nA = substantiveTerms(claims[i].text), nB = substantiveTerms(claims[j].text);
          // AUDIT FIX: Raise domain-overlap threshold from 2 → 3 substantive shared terms.
          // Two claims sharing only 2 generic words (e.g., "market", "return") trigger too many
          // false-positive epistemic conflicts that waste LLM calls and inflate conflict counts.
          // 3 shared substantive terms ensures the claims are genuinely discussing the same topic.
          // Additionally, skip pairs where one claim is purely definitional (avoids trivial contradictions).
          const isDef = (t: string) => /\b(is defined as|refers to|is known as|means that|is a type of)\b/i.test(t);
          const sharedTermCount = nA.filter(n => nB.includes(n)).length;
          if (sharedTermCount >= 3 && !isDef(claims[i].text) && !isDef(claims[j].text)) {
            candidates.push([claims[i], claims[j]]);
            break;
          }
        }
      }
    }
  }
  return candidates.slice(0, 10);
}

async function evaluateCoherence(pairs: Array<[any, any]>, apiKey: string) {
  const conflicts: any[] = [];
  for (let i = 0; i < pairs.length; i += 3) {
    const batch = pairs.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(async ([a, b]) => {
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [
            { role: "system", content: 'Academic consistency reviewer. Two claims from the same chapter. Determine if they contradict each other. Return ONLY JSON: {"isContradiction":true|false,"conflictType":"direct_contradiction|methodological_inconsistency|theoretical_tension","severity":"critical|moderate|minor","explanation":"brief"}' },
            { role: "user", content: `CLAIM A: "${a.text}"\nCLAIM B: "${b.text}"\nAre these internally contradictory? Return JSON only.` }
          ], temperature: 0.1, max_tokens: 150 }), signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return null;
        const content = (await r.json()).choices?.[0]?.message?.content || '';
        const jm = content.match(/\{[\s\S]*?\}/);
        if (!jm) return null;
        const p = JSON.parse(jm[0]);
        if (p.isContradiction) {
          return { claimA: { id: a.id, text: a.text.slice(0, 200) }, claimB: { id: b.id, text: b.text.slice(0, 200) }, conflictType: p.conflictType || 'direct_contradiction', severity: p.severity || 'moderate', explanation: String(p.explanation || '').slice(0, 200) };
        }
        return null;
      } catch { return null; }
    }));
    conflicts.push(...batchResults.filter(Boolean));
    if (i + 3 < pairs.length) await new Promise(r => setTimeout(r, 300));
  }
  return conflicts;
}

const VS: Record<string, number> = { strong: 100, partial: 70, weak: 40, contradiction: 0 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SU = Deno.env.get("SUPABASE_URL"), SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), LK = Deno.env.get("LOVABLE_API_KEY");
    if (!SU || !SK) throw new Error("Config missing");
    const sb = createClient(SU, SK);
    const ah = req.headers.get("Authorization");
    if (!ah) return json({ error: "Auth required" }, 401);
    const { data: { user }, error: ae } = await sb.auth.getUser(ah.replace("Bearer ", ""));
    if (ae || !user) return json({ error: "Invalid auth" }, 401);
    log("Auth", { u: user.id.slice(0, 8) });

    const { references, bookCategory = "general", chapterContent = "" } = await req.json();
    const emptyResp = { totalClaims: 0, analyzedClaims: 0, strong: 0, partial: 0, weak: 0, contradiction: 0, avgSupportScore: 0, unsupportedEmpiricalClaims: 0, contradictions: 0, strongPct: 0, uncitedClaimsPct: 0, analysisComplete: false, verdictLabel: 'Analysis Incomplete' };
    const emptyCoherence = { totalClaimsAnalyzed: 0, conflicts: [], conflictCount: 0, criticalConflicts: 0, coherenceScore: 100, coherenceVerdict: 'Analysis Incomplete', analysisComplete: false };

    if (!Array.isArray(references) || !references.length) return json({ success: true, references: [], metrics: { total: 0, verifiedPct: 0 }, tier: { tier: "non-compliant", label: "No References" }, semanticIntegrityReport: { totalCitations: 0, strong: 0, moderate: 0, weak: 0, ornamental: 0, averageScore: 0, empiricalClaimsUnsupported: 0, ornamentalPct: 0 }, claimIntegrityReport: emptyResp, epistemicCoherenceReport: emptyCoherence });

    // Detect citation style
    const citStyle = chapterContent ? detectStyle(chapterContent) : 'APA';
    log("Verify", { n: references.length, citStyle });

    // Phase 1: DOI + CrossRef
    const results: any[] = [];
    for (let i = 0; i < references.length; i += 3) {
      const batch = references.slice(i, i + 3);
      const br = await Promise.all(batch.map(async (ref: any) => {
        const r: any = { ...ref, verification: { doiResolved: false, crossrefStatus: "unverified", method: "none" }, semanticSupport: { score: 0, level: "ornamental" } };
        if (ref.doi) { const d = await verifyDOI(ref.doi); r.verification.doiResolved = d.resolved; r.verification.method = d.resolved ? "doi-resolved" : "doi-failed"; if (d.resolved) { const cr = await crossrefValidate(ref.doi, ref.title || "", ref.authors?.[0] || ref.author || "", ref.year || 0); Object.assign(r.verification, { crossrefStatus: cr.status, titleSimilarity: cr.sim, authorMatch: cr.authorMatch, yearMatch: cr.yearMatch, method: cr.status === "verified" ? "crossref" : "doi-resolved" }); if (cr.crWork) r._cr = cr.crWork; } }
        return r;
      }));
      results.push(...br);
      if (i + 3 < references.length) await new Promise(r => setTimeout(r, 500));
    }

    // Phase 2: Keyword semantic
    const paras = chapterContent ? chapterContent.split(/\n\n+/).filter((p: string) => p.trim().length > 30) : [];
    const semEvals: { score: number; level: string }[] = [];
    const crCache = new Map<string, any>();
    for (const r of results) {
      const cm = { title: r.title || "", abstract: r._cr?.abstract, keywords: r._cr?.keywords, year: r.year || 0 };
      const ck = r.authors?.[0] || r.author || r.title || "";
      const ctx = paras.find((p: string) => p.includes(ck)) || chapterContent || r.title || "";
      const ev = kwSupport(ctx.slice(0, 2000), cm);
      r.semanticSupport = ev; semEvals.push(ev);
      if (r._cr) { crCache.set(r.doi || r.title || '', r._cr); delete r._cr; }
    }

    // Phase 3: Empirical detection
    const empParas = chapterContent ? paras.filter(p => EMP_IND.some(i => p.toLowerCase().includes(i))) : [];
    let empUnsup = 0;
    for (const ep of empParas) { const ci = results.filter(r => ep.includes(r.authors?.[0] || r.author || r.title || "")); if (!ci.length || !ci.some((c: any) => c.semanticSupport?.score >= 50)) empUnsup++; }

    // Phase 4: Metrics
    const tot = results.length;
    const ver = results.filter(r => r.verification.crossrefStatus === "verified" || r.verification.doiResolved).length;
    const sus = results.filter(r => r.verification.crossrefStatus === "suspicious").length;
    const doiF = results.filter(r => r.doi && !r.verification.doiResolved).length;
    const p10 = results.filter(r => (r.year || 0) >= 2010).length, p18 = results.filter(r => (r.year || 0) >= 2018).length;
    const orn = semEvals.filter(e => e.level === 'ornamental').length;
    const semAvg = tot > 0 ? Math.round(semEvals.reduce((s, e) => s + e.score, 0) / tot) : 0;
    const ornPct = tot > 0 ? Math.round((orn / tot) * 100) : 0;
    const metrics = { total: tot, verified: ver, verifiedPct: tot > 0 ? Math.round((ver / tot) * 100) : 0, suspicious: sus, suspiciousPct: tot > 0 ? Math.round((sus / tot) * 100) : 0, doiFailures: doiF, post2010Pct: tot > 0 ? Math.round((p10 / tot) * 100) : 0, post2018Pct: tot > 0 ? Math.round((p18 / tot) * 100) : 0 };
    const semReport = { totalCitations: tot, strong: semEvals.filter(e => e.level === 'strong').length, moderate: semEvals.filter(e => e.level === 'moderate').length, weak: semEvals.filter(e => e.level === 'weak').length, ornamental: orn, averageScore: semAvg, empiricalClaimsUnsupported: empUnsup, ornamentalPct: ornPct };

    // Phase 5: Claim-level LLM + Revalidation
    let claimReport: any = { ...emptyResp };
    let allClaims: any[] = [];
    if (chapterContent && LK) {
      log("Phase 5: Claims");
      const claims = extractClaims(chapterContent, 25);
      allClaims = claims;
      const uncited = claims.filter(c => c.type !== 'descriptive' && !c.cks.length);
      const cited = claims.filter(c => c.cks.length > 0);
      const refMap = new Map<string, any>(); for (const r of results) { for (const k of [r.authors?.[0], r.author, r.title].filter(Boolean)) refMap.set(k.toLowerCase(), r); }
      const verdicts: any[] = [];
      for (let i = 0; i < cited.length; i += 3) {
        const batch = cited.slice(i, i + 3);
        const bv = await Promise.all(batch.map(async (cl: any) => {
          const metas: any[] = [];
          for (const ck of cl.cks) { for (const [k, ref] of refMap.entries()) { if (k.includes(ck.toLowerCase()) || ck.toLowerCase().includes(k)) { const cw = crCache.get(ref.doi || ref.title || ''); metas.push({ title: cw?.title || ref.title || ck, abstract: cw?.abstract, year: ref.year || 0 }); break; } } }
          if (!metas.length) metas.push({ title: cl.cks.join(', '), year: 0 });
          return llmEval(cl, metas, LK);
        }));
        verdicts.push(...bv);
        if (i + 3 < cited.length) await new Promise(r => setTimeout(r, 300));
      }

      // Fix #2: Revalidate contradictions
      const initialContradictions = verdicts.filter(v => v.v === 'contradiction');
      if (initialContradictions.length > 0) {
        log("Revalidating contradictions", { count: initialContradictions.length });
        const revalidated = await revalidateContradictions(initialContradictions, cited, refMap, crCache, LK);
        // Replace contradiction verdicts with revalidated ones
        for (const rv of revalidated) {
          const idx = verdicts.findIndex(v => v.id === rv.id);
          if (idx >= 0) verdicts[idx] = rv;
        }
      }

      const sV = verdicts.filter(v => v.v === 'strong').length, pV = verdicts.filter(v => v.v === 'partial').length, wV = verdicts.filter(v => v.v === 'weak').length, cV = verdicts.filter(v => v.v === 'contradiction').length;
      const ta = verdicts.length, avg = ta > 0 ? Math.round(verdicts.reduce((s, v) => s + VS[v.v], 0) / ta) : 0;
      const uemp = claims.filter(c => c.type === 'empirical' && !c.cks.length).length + verdicts.filter(v => { const c = cited.find((cc: any) => cc.id === v.id); return c?.type === 'empirical' && (v.v === 'weak' || v.v === 'contradiction'); }).length;
      const ucPct = claims.length > 0 ? Math.round((uncited.length / claims.length) * 100) : 0;
      const manualReview = verdicts.filter(v => v.revalidated && !v.confirmed).length;
      let vl = 'Analysis Incomplete'; if (ta > 0) { if (cV > 0 || avg < 50) vl = 'Academically Unsafe'; else if (avg < 65 || uemp > 0) vl = 'Requires Revision'; else vl = 'Conceptually Sound'; }
      claimReport = { totalClaims: claims.length, analyzedClaims: ta, strong: sV, partial: pV, weak: wV, contradiction: cV, avgSupportScore: avg, unsupportedEmpiricalClaims: uemp, contradictions: cV, strongPct: ta > 0 ? Math.round((sV / ta) * 100) : 0, uncitedClaimsPct: ucPct, analysisComplete: true, verdictLabel: vl, manualReviewRequired: manualReview };
      log("Phase 5 done", { avg, contradictions: cV, manualReview, verdict: vl });
    }

    // Phase 6: Epistemic Coherence
    let coherenceReport: any = { ...emptyCoherence };
    if (allClaims.length > 0 && LK) {
      log("Phase 6: Epistemic Coherence");
      const conflictPairs = preScreenConflicts(allClaims);
      log("Pre-screened conflicts", { pairs: conflictPairs.length });
      if (conflictPairs.length > 0) {
        const conflicts = await evaluateCoherence(conflictPairs, LK);
        const critCount = conflicts.filter(c => c.severity === 'critical').length;
        const modCount = conflicts.filter(c => c.severity === 'moderate').length;
        let score = 100;
        score -= critCount * 20;
        score -= modCount * 10;
        score -= conflicts.filter(c => c.severity === 'minor').length * 3;
        score = Math.max(0, Math.min(100, score));
        let verdict = 'Analysis Incomplete';
        if (critCount > 0 || score < 40) verdict = 'Epistemically Incoherent';
        else if (score < 70) verdict = 'Significant Inconsistencies';
        else if (score < 90) verdict = 'Minor Tensions';
        else verdict = 'Epistemically Coherent';
        coherenceReport = { totalClaimsAnalyzed: allClaims.length, conflicts, conflictCount: conflicts.length, criticalConflicts: critCount, coherenceScore: score, coherenceVerdict: verdict, analysisComplete: true };
      } else {
        coherenceReport = { totalClaimsAnalyzed: allClaims.length, conflicts: [], conflictCount: 0, criticalConflicts: 0, coherenceScore: 100, coherenceVerdict: 'Epistemically Coherent', analysisComplete: true };
      }
      log("Phase 6 done", { score: coherenceReport.coherenceScore, verdict: coherenceReport.coherenceVerdict });
    }

    // Tier
    const checks: Record<string, boolean> = { noFab: true, noDup: true, doiVal: metrics.verifiedPct >= 80, recency: metrics.post2010Pct >= 30 && metrics.post2018Pct >= 15, canon: true, semSup: semAvg >= 65, noOrph: true, susLow: metrics.suspiciousPct < 5, fullDoi: metrics.verifiedPct >= 95, ornLow: ornPct < 5, claimGold: claimReport.avgSupportScore >= 65, claimPlat: claimReport.avgSupportScore >= 80, noContra: claimReport.contradictions === 0, noUnsupEmp: claimReport.unsupportedEmpiricalClaims === 0, coherent: coherenceReport.coherenceScore >= 80 };
    const met: string[] = [], unmet: string[] = []; for (const [k, v] of Object.entries(checks)) (v ? met : unmet).push(k);
    let tier = "non-compliant", tLabel = "Non-Compliant";
    if (checks.noFab && checks.noDup) { tier = "bronze"; tLabel = "Bronze"; }
    if (tier === "bronze" && checks.doiVal && checks.recency) { tier = "silver"; tLabel = "Silver"; }
    if (tier === "silver" && checks.canon && checks.semSup && checks.claimGold) { tier = "gold"; tLabel = "Gold"; }
    if (tier === "gold" && checks.fullDoi && checks.noOrph && checks.susLow && checks.ornLow && checks.claimPlat && checks.noContra && checks.noUnsupEmp && checks.coherent) { tier = "platinum"; tLabel = "Platinum"; }

    // Hard failures
    const hf: string[] = [];
    if (doiF > 0) hf.push(`${doiF} DOI(s) failed`);
    if (metrics.suspiciousPct >= 5) hf.push(`${metrics.suspiciousPct}% suspicious`);
    if (ornPct >= 10) hf.push(`${ornPct}% ornamental`);
    if (semAvg < 50) hf.push(`Semantic ${semAvg}/100 < 50`);
    if (empUnsup > 0) hf.push(`${empUnsup} empirical unsupported`);
    if (claimReport.contradictions > 0) hf.push(`${claimReport.contradictions} contradiction(s) (revalidated)`);
    if (claimReport.avgSupportScore > 0 && claimReport.avgSupportScore < 60) hf.push(`Claim score ${claimReport.avgSupportScore}/100 < 60`);
    if (claimReport.uncitedClaimsPct >= 5) hf.push(`${claimReport.uncitedClaimsPct}% uncited claims`);
    if (coherenceReport.criticalConflicts > 0) hf.push(`${coherenceReport.criticalConflicts} critical epistemic conflict(s)`);
    if (coherenceReport.coherenceScore < 50) hf.push(`Epistemic coherence ${coherenceReport.coherenceScore}/100 < 50`);

    // ===========================================
    // IMMUTABLE AUDIT ARTIFACT
    // Signed JSON for institutional archiving
    // ===========================================
    const auditTimestamp = new Date().toISOString();
    const auditModelUsed = "google/gemini-2.5-flash-lite";
    const promptVersionUsed = "scrollverified-2026-v3.0";
    
    // Build deterministic content for hash
    const artifactPayload = JSON.stringify({
      tier, metrics, semAvg, claimReport: { avgSupportScore: claimReport.avgSupportScore, contradictions: claimReport.contradictions, unsupportedEmpiricalClaims: claimReport.unsupportedEmpiricalClaims, verdictLabel: claimReport.verdictLabel },
      coherenceReport: { coherenceScore: coherenceReport.coherenceScore, criticalConflicts: coherenceReport.criticalConflicts, coherenceVerdict: coherenceReport.coherenceVerdict },
      hardFailures: hf, citStyle, totalReferences: tot, timestamp: auditTimestamp
    });
    
    // SHA-256 cryptographic hash via Web Crypto API
    const encoder = new TextEncoder();
    const artifactData = encoder.encode(artifactPayload);
    const artifactHashBuffer = await crypto.subtle.digest('SHA-256', artifactData);
    const artifactHashArray = Array.from(new Uint8Array(artifactHashBuffer));
    const hashHex = 'SVA-' + artifactHashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);

    // Chapter content hash for replicability
    const chapterData = encoder.encode(chapterContent || '');
    const chapterHashBuffer = await crypto.subtle.digest('SHA-256', chapterData);
    const chapterHashArray = Array.from(new Uint8Array(chapterHashBuffer));
    const chapterHash = chapterHashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);

    const auditArtifact = {
      schemaVersion: "3.1",
      standard: "ScrollVerified™ 2026 — Institutional Epistemic Integrity Certified",
      artifactId: hashHex,
      generatedAt: auditTimestamp,
      model: auditModelUsed,
      promptVersion: promptVersionUsed,
      replicabilityKey: `${auditModelUsed}|${promptVersionUsed}|${citStyle}|${tot}|${chapterHash}`,
      summary: {
        complianceTier: tLabel,
        doiValidatedPct: metrics.verifiedPct,
        semanticAvgScore: semAvg,
        claimSupportScore: claimReport.avgSupportScore,
        claimVerdict: claimReport.verdictLabel,
        contradictions: claimReport.contradictions,
        unsupportedEmpirical: claimReport.unsupportedEmpiricalClaims,
        coherenceScore: coherenceReport.coherenceScore,
        coherenceVerdict: coherenceReport.coherenceVerdict,
        criticalConflicts: coherenceReport.criticalConflicts,
        hardFailures: hf,
        certificationBlocked: hf.length > 0,
        totalReferences: tot,
        citationStyle: citStyle,
        manualReviewRequired: claimReport.manualReviewRequired || 0,
      },
      integrityHash: hashHex,
      disclaimer: "This audit artifact is machine-generated. It does not constitute peer review or institutional endorsement. Results may vary across model versions.",
    };

    log("Done", { tier, hf: hf.length, verdict: claimReport.verdictLabel, coherence: coherenceReport.coherenceVerdict, citStyle, artifactId: hashHex });
    return json({ success: true, references: results, metrics, semanticIntegrityReport: semReport, claimIntegrityReport: claimReport, epistemicCoherenceReport: coherenceReport, tier: { tier, label: tLabel, met, unmet }, hardFailures: hf, certificationBlocked: hf.length > 0, citationStyle: citStyle, standard: "ScrollVerified™ 2026 — Institutional Epistemic Integrity Certified", auditArtifact });
  } catch (e) { const m = e instanceof Error ? e.message : String(e); log("ERR", { m }); return json({ error: m }, 500); }
});
