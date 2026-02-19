import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[CHIEF-EDITOR] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// ============================================================
// AUDIT PROVENANCE — Locked model + prompt version
// ============================================================
const AUDIT_MODEL = "google/gemini-2.5-flash";
const AUDIT_PROMPT_VERSION = "v2.2"; // v2.2: Enforce mandatory chapterSuggestions for low-scoring chapters

// ============================================================
// CERTIFICATION ELIGIBILITY THRESHOLDS
// ============================================================
const CERT_THRESHOLDS = {
  structural: 75,
  academic: 80,
  pedagogical: 75,
  overall: 78,
};

const RUBRIC = {
  structural: {
    weight: 0.3,
    criteria: [
      "Chapter has a clear title that accurately reflects content",
      "Content follows logical progression within the chapter",
      "Sections are well-organized with appropriate headings",
      "Word count is appropriate (not too sparse or bloated)",
      "Transitions between sections are smooth",
      "Opening hook engages the reader",
      "Closing summarizes or transitions effectively",
    ],
  },
  academic: {
    weight: 0.35,
    criteria: [
      "Claims are supported with evidence or reasoning",
      "Technical terminology is used correctly and consistently",
      "Depth of coverage matches stated objectives",
      "No factual errors or misleading statements",
      "Content is up-to-date and relevant",
      "Appropriate complexity for target audience",
      "Key concepts are defined before use",
    ],
  },
  pedagogical: {
    weight: 0.35,
    criteria: [
      "Clear learning objectives are implied or stated",
      "Examples and illustrations support understanding",
      "Content builds on prior knowledge progressively",
      "Active learning prompts (questions, exercises) are present",
      "Key takeaways are identifiable",
      "Variety of explanation methods (narrative, examples, analogies)",
      "Assessment alignment - quiz questions could test this content",
    ],
  },
};

// ============================================================
// PROPORTIONAL PENALTY ENGINE (Pre-AI, Hard Rules)
// ============================================================
interface PenaltyResult {
  structuralCap: number;
  academicCap: number;
  pedagogicalCap: number;
  penalties: Array<{ dimension: string; rule: string; cap: number; evidence: string; chapterNumber: number }>;
}

function computeProportionalPenalties(chapters: any[], totalChapters: number, bookType?: string): PenaltyResult {
  const penalties: PenaltyResult["penalties"] = [];

  // Track violations per dimension per rule
  const violationCounts: Record<string, number> = {};

  for (const ch of chapters) {
    const content = ch.content || "";
    const wordCount = ch.word_count || content.split(/\s+/).filter(Boolean).length;
    const chNum = ch.chapter_number;

    // STRUCTURAL: Word count checks
    if (wordCount < 400) {
      violationCounts["WORD_COUNT_CRITICAL"] = (violationCounts["WORD_COUNT_CRITICAL"] || 0) + 1;
      penalties.push({ dimension: "structural", rule: "WORD_COUNT_CRITICAL", cap: 0, evidence: `Ch.${chNum}: ${wordCount} words (critically low, <400)`, chapterNumber: chNum });
    } else if (wordCount < 800) {
      violationCounts["WORD_COUNT_LOW"] = (violationCounts["WORD_COUNT_LOW"] || 0) + 1;
      penalties.push({ dimension: "structural", rule: "WORD_COUNT_LOW", cap: 0, evidence: `Ch.${chNum}: ${wordCount} words (<800)`, chapterNumber: chNum });
    }

    // PEDAGOGICAL: No examples
    // Broadened: code blocks, inline code, numbered lists, and comparison phrases also count as examples
    const examplePatterns = /\b(for example|e\.g\.|for instance|such as|consider|let's say|imagine|suppose|here is|here's|the following|as shown|as illustrated|in practice|in this case|to illustrate|let us|let's look|take a look|notice how|observe that|demonstrated|walkthrough|step[\s-]by[\s-]step)\b/gi;
    const codeBlockCount = (content.match(/```[\s\S]*?```/g) || []).length;
    const inlineCodeCount = (content.match(/`[^`]+`/g) || []).length;
    const examplePhraseCount = (content.match(examplePatterns) || []).length;
    const totalExampleSignals = examplePhraseCount + codeBlockCount + Math.floor(inlineCodeCount / 3);
    if (totalExampleSignals === 0) {
      violationCounts["NO_EXAMPLES"] = (violationCounts["NO_EXAMPLES"] || 0) + 1;
      penalties.push({ dimension: "pedagogical", rule: "NO_EXAMPLES", cap: 0, evidence: `Ch.${chNum}: No examples, code blocks, or illustrative phrases`, chapterNumber: chNum });
    }

    // ACADEMIC: No definitions
    // Broadened: formal + bestseller-style definitions (narrative explanations, analogies, conceptual framing)
    const definitionPatterns = /\b(is defined as|refers to|means that|can be described as|are called|is a type of|is the process of|is known as|stands for|abbreviated as|represents|denotes|specifies|implements|we define|definition of|def\s+\w+|class\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|type\s+\w+\s*=|interface\s+\w+|enum\s+\w+|this is the|this means|in other words|put simply|in simple terms|the core idea|the key insight|the fundamental|the distinction between|the difference between|what this means|think of it as|think of\s|this refers|this concept|this principle|essentially|at its core|boils down to|in essence|the premise|the notion)\b/gi;
    const definitionCount = (content.match(definitionPatterns) || []).length;
    // Bestseller content uses narrative definitions extensively — require higher threshold only for academic
    const defThreshold = (bookType === "bestseller" || bookType === "comic") ? 0 : 0;
    if (definitionCount <= defThreshold) {
      violationCounts["NO_DEFINITIONS"] = (violationCounts["NO_DEFINITIONS"] || 0) + 1;
      penalties.push({ dimension: "academic", rule: "NO_DEFINITIONS", cap: 0, evidence: `Ch.${chNum}: No key concept definitions`, chapterNumber: chNum });
    }

    // STRUCTURAL: No headings
    const headingCount = (content.match(/^#{1,4}\s/gm) || []).length;
    if (headingCount < 2 && wordCount > 500) {
      violationCounts["NO_STRUCTURE"] = (violationCounts["NO_STRUCTURE"] || 0) + 1;
      penalties.push({ dimension: "structural", rule: "NO_STRUCTURE", cap: 0, evidence: `Ch.${chNum}: Only ${headingCount} headings for ${wordCount} words`, chapterNumber: chNum });
    }

    // PEDAGOGICAL: No questions or exercises
    // Broadened: code comments with TODO/NOTE, numbered steps, and reflection prompts also count
    const questionCount = (content.match(/\?/g) || []).length;
    const exercisePatterns = /\b(exercise|try it|practice|quiz|question|task|activity|challenge|try this|your turn|hands[\s-]on|experiment|implement|modify the|build a|create a|write a|extend the|homework|lab|worksheet|reflection|think about|what would happen|what if|how would you|can you)\b/gi;
    const exerciseCount = (content.match(exercisePatterns) || []).length;
    if (questionCount === 0 && exerciseCount === 0) {
      violationCounts["NO_ENGAGEMENT"] = (violationCounts["NO_ENGAGEMENT"] || 0) + 1;
      penalties.push({ dimension: "pedagogical", rule: "NO_ENGAGEMENT", cap: 0, evidence: `Ch.${chNum}: No questions or exercises`, chapterNumber: chNum });
    }
  }

  // ============================================================
  // PROPORTIONAL SCALING: penalty = f(violation count / total chapters)
  // 1 weak chapter → -10, 2 → -20, 3+ → hard limit
  // ============================================================
  const baseCaps: Record<string, { dimension: string; hardLimit: number }> = {
    WORD_COUNT_LOW: { dimension: "structural", hardLimit: 60 },
    WORD_COUNT_CRITICAL: { dimension: "structural", hardLimit: 40 },
    NO_EXAMPLES: { dimension: "pedagogical", hardLimit: 65 },
    NO_DEFINITIONS: { dimension: "academic", hardLimit: 70 },
    NO_STRUCTURE: { dimension: "structural", hardLimit: 55 },
    NO_ENGAGEMENT: { dimension: "pedagogical", hardLimit: 70 },
  };

  let structuralCap = 100;
  let academicCap = 100;
  let pedagogicalCap = 100;

  for (const [rule, count] of Object.entries(violationCounts)) {
    const config = baseCaps[rule];
    if (!config) continue;

    let cap: number;
    if (count >= 3 || count >= totalChapters * 0.5) {
      // 3+ violations or ≥50% of chapters → hard limit
      cap = config.hardLimit;
    } else if (count === 2) {
      // 2 violations → interpolate: hardLimit + 10
      cap = config.hardLimit + 10;
    } else {
      // 1 violation → mild: hardLimit + 20
      cap = config.hardLimit + 20;
    }

    // Update the cap for each penalty entry of this rule
    penalties.filter(p => p.rule === rule).forEach(p => p.cap = cap);

    if (config.dimension === "structural") structuralCap = Math.min(structuralCap, cap);
    if (config.dimension === "academic") academicCap = Math.min(academicCap, cap);
    if (config.dimension === "pedagogical") pedagogicalCap = Math.min(pedagogicalCap, cap);
  }

  return { structuralCap, academicCap, pedagogicalCap, penalties };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auditStartTime = Date.now();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const body = await req.json();
    const { bookId, action = "audit" } = body;

    if (!bookId) {
      return new Response(JSON.stringify({ error: "bookId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Request", { bookId: bookId.slice(0, 8), action, userId: user.id.slice(0, 8) });

    // Fetch book and chapters
    const { data: book, error: bookError } = await supabase
      .from("books").select("*").eq("id", bookId).single();
    if (bookError || !book) throw new Error("Book not found");

    if (book.user_id !== user.id && book.creator_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters").select("*").eq("book_id", bookId)
      .order("chapter_number", { ascending: true });
    if (chaptersError) throw new Error("Failed to fetch chapters");

    const generatedChapters = (chapters || []).filter((ch: any) => ch.is_generated && ch.content);

    if (generatedChapters.length === 0) {
      return new Response(JSON.stringify({ error: "No generated chapters to audit" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // STEP 1: Proportional Deterministic Penalties
    // ============================================================
    const penaltyResult = computeProportionalPenalties(generatedChapters, generatedChapters.length, book.book_type);
    log("Penalties computed", {
      caps: { s: penaltyResult.structuralCap, a: penaltyResult.academicCap, p: penaltyResult.pedagogicalCap },
      count: penaltyResult.penalties.length,
    });

    // Create audit record
    const { data: auditRecord, error: insertError } = await supabase
      .from("book_audits").insert({
        book_id: bookId,
        user_id: user.id,
        status: "running",
        penalty_log: penaltyResult.penalties,
        audit_model: AUDIT_MODEL,
        audit_prompt_version: AUDIT_PROMPT_VERSION,
      }).select().single();

    if (insertError) throw new Error(`Failed to create audit: ${insertError.message}`);

    log("Audit started", { auditId: auditRecord.id.slice(0, 8), chapters: generatedChapters.length, model: AUDIT_MODEL, promptVersion: AUDIT_PROMPT_VERSION });

    // Build chapter summaries
    const chapterSummaries = generatedChapters.map((ch: any) => ({
      number: ch.chapter_number,
      title: ch.title,
      wordCount: ch.word_count || 0,
      content: (ch.content || "").slice(0, 4000),
    }));

    // ============================================================
    // STEP 2: AI Evaluation with Contrastive Evidence
    // ============================================================
    const auditPrompt = `You are a Chief Editor performing a rigorous quality audit of an educational book.

BOOK: "${book.title}"
CATEGORY: ${book.category}
TYPE: ${book.book_type || "text"}
TOTAL CHAPTERS: ${chapters?.length || 0} (${generatedChapters.length} generated)

EVALUATION RUBRIC:

**STRUCTURAL INTEGRITY (30% weight)**
Criteria: ${RUBRIC.structural.criteria.join("; ")}

**ACADEMIC RIGOR (35% weight)**
Criteria: ${RUBRIC.academic.criteria.join("; ")}

**PEDAGOGICAL QUALITY (35% weight)**
Criteria: ${RUBRIC.pedagogical.criteria.join("; ")}

CHAPTERS TO AUDIT:
${chapterSummaries.map((ch: any) => `
--- Chapter ${ch.number}: "${ch.title}" (${ch.wordCount} words) ---
${ch.content}
`).join("\n")}

CRITICAL EVALUATION RULES:
1. Score each dimension 0-100 based on the rubric criteria. Be BRUTALLY honest - do NOT inflate scores.
2. For EVERY score (whether below or above 85), you MUST provide a direct quote from the chapter text as evidence justifying that score. No quote = score is invalid.
3. For each dimension, provide specific findings with chapter numbers AND the supporting quote.
4. Flag weak sections with severity (critical/major/minor) and specific suggestions.
5. Provide per-chapter improvement suggestions.

CONTRASTIVE BENCHMARK: Compare each chapter against what a well-written textbook chapter looks like:
- A good chapter has 1000+ words, 3+ subsections, 2+ examples, defined terminology, and engagement questions.
- Score relative to this benchmark, not relative to "AI-generated content standards."

MANDATORY: The "chapterSuggestions" array MUST contain an entry for EVERY chapter that scores below 80 in any dimension. Each entry MUST have at least 2 specific, actionable improvements. The "flaggedSections" array MUST contain entries for any section with critical or major issues. Do NOT return empty arrays for these fields unless every chapter scores 80+ across all dimensions.

Respond as JSON:
{
  "structural": {
    "score": <0-100>,
    "findings": [{"criterion": "...", "assessment": "...", "quote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "academic": {
    "score": <0-100>,
    "findings": [{"criterion": "...", "assessment": "...", "quote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "pedagogical": {
    "score": <0-100>,
    "findings": [{"criterion": "...", "assessment": "...", "quote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "flaggedSections": [
    {"chapterNumber": 1, "section": "Introduction", "issue": "...", "severity": "critical|major|minor", "suggestion": "..."}
  ],
  "chapterSuggestions": [
    {"chapterNumber": 1, "improvements": ["..."]}
  ]
}`;

    // Retry with model fallback: primary → flash-lite → error
    const FALLBACK_MODELS = [AUDIT_MODEL, "google/gemini-2.5-flash-lite"];
    const auditMessages = [
      { role: "system", content: "You are a rigorous academic editor. Score honestly against textbook benchmarks. Never inflate. Every score MUST have a direct quote from the text as evidence. Output valid JSON only." },
      { role: "user", content: auditPrompt },
    ];

    let aiResponse: Response | null = null;
    let usedModel = AUDIT_MODEL;

    for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
      const model = FALLBACK_MODELS[attempt];
      log("AI attempt", { attempt: attempt + 1, model });

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages: auditMessages }),
      });

      if (resp.ok) {
        aiResponse = resp;
        usedModel = model;
        break;
      }

      const status = resp.status;
      await resp.text();
      log("AI error", { status, model, attempt: attempt + 1 });

      // For 402/429, try fallback model before giving up
      if ((status === 402 || status === 429) && attempt < FALLBACK_MODELS.length - 1) {
        log("Falling back to cheaper model", { next: FALLBACK_MODELS[attempt + 1] });
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Last attempt failed
      await supabase.from("book_audits").update({ status: "failed" }).eq("id", auditRecord.id);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a few minutes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI quota temporarily exhausted. Please try again in a few minutes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    if (!aiResponse) {
      await supabase.from("book_audits").update({ status: "failed" }).eq("id", auditRecord.id);
      throw new Error("All AI models failed");
    }

    log("AI success", { model: usedModel });

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // ============================================================
    // ROBUST JSON PARSER — Multi-strategy extraction (ported from STO audit)
    // ============================================================
    function fixNewlinesInJsonStrings(raw: string): string {
      let result = '';
      let inString = false;
      let escaped = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (escaped) { result += ch; escaped = false; continue; }
        if (ch === '\\' && inString) { escaped = true; result += ch; continue; }
        if (ch === '"') { inString = !inString; result += ch; continue; }
        if (inString && ch === '\n') { result += '\\n'; continue; }
        if (inString && ch === '\r') { result += '\\r'; continue; }
        if (inString && ch === '\t') { result += '\\t'; continue; }
        result += ch;
      }
      return result;
    }

    function cleanAndParseJSON(jsonStr: string): any {
      let cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
      try { return JSON.parse(cleaned); } catch { /* continue */ }
      try { return JSON.parse(fixNewlinesInJsonStrings(cleaned)); } catch { /* continue */ }
      try { return JSON.parse(cleaned.replace(/\n/g, '\\n').replace(/\r/g, '')); } catch { /* continue */ }
      return null;
    }

    function tryParseAuditJSON(raw: string): any {
      // Strategy 1: JSON fenced block
      const jsonFence = raw.match(/```json\s*\n?([\s\S]*?)```/);
      if (jsonFence) { const p = cleanAndParseJSON(jsonFence[1].trim()); if (p) return p; }
      // Strategy 2: Any fenced block
      const anyFence = raw.match(/```\s*\n?([\s\S]*?)```/);
      if (anyFence) { const p = cleanAndParseJSON(anyFence[1].trim()); if (p) return p; }
      // Strategy 3: First-to-last brace
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first !== -1 && last > first) { const p = cleanAndParseJSON(raw.substring(first, last + 1)); if (p) return p; }
      // Strategy 4: Raw
      const p = cleanAndParseJSON(raw.trim());
      if (p) return p;
      return null;
    }

    let auditResults;
    let parseStrategy = 'unknown';
    const parsed = tryParseAuditJSON(rawContent);

    if (parsed && typeof parsed === 'object' && (parsed.structural || parsed.academic || parsed.pedagogical)) {
      auditResults = parsed;
      parseStrategy = 'json';
      log("JSON parsed", { structural: parsed.structural?.score, academic: parsed.academic?.score, pedagogical: parsed.pedagogical?.score, suggestions: parsed.chapterSuggestions?.length || 0 });
    } else {
      parseStrategy = 'regex_fallback';
      log("JSON parse failed, using regex fallback", { rawPreview: rawContent.slice(0, 300) });

      // Extract scores via regex
      const sScore = rawContent.match(/"structural"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const aScore = rawContent.match(/"academic"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const pScore = rawContent.match(/"pedagogical"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];

      // Extract chapterSuggestions via regex
      const suggestionsBlock = rawContent.match(/"chapterSuggestions"\s*:\s*\[([\s\S]*?)\]\s*}/);
      const extractedSuggestions: any[] = [];
      if (suggestionsBlock) {
        const chapterMatches = [...suggestionsBlock[1].matchAll(/"chapterNumber"\s*:\s*(\d+)/g)];
        for (const cm of chapterMatches) {
          const chNum = parseInt(cm[1]);
          // Find improvements array near this chapter
          const startIdx = cm.index || 0;
          const slice = suggestionsBlock[1].substring(startIdx, startIdx + 1000);
          const impMatch = slice.match(/"improvements"\s*:\s*\[([\s\S]*?)\]/);
          const improvements: string[] = [];
          if (impMatch) {
            const items = [...impMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)];
            for (const item of items) improvements.push(item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
          }
          if (improvements.length > 0) extractedSuggestions.push({ chapterNumber: chNum, improvements });
        }
      }

      auditResults = {
        structural: { score: sScore ? parseInt(sScore) : 50, findings: [{ criterion: "Partial parse", assessment: "AI response was partially parsed via regex", quote: "N/A", chapterNumbers: [] }] },
        academic: { score: aScore ? parseInt(aScore) : 50, findings: [{ criterion: "Partial parse", assessment: "AI response was partially parsed via regex", quote: "N/A", chapterNumbers: [] }] },
        pedagogical: { score: pScore ? parseInt(pScore) : 50, findings: [{ criterion: "Partial parse", assessment: "AI response was partially parsed via regex", quote: "N/A", chapterNumbers: [] }] },
        flaggedSections: [],
        chapterSuggestions: extractedSuggestions,
      };

      log("Regex extracted", { s: sScore, a: aScore, p: pScore, suggestions: extractedSuggestions.length });
    }

    // ============================================================
    // STEP 3: Apply Proportional Penalty Caps
    // ============================================================
    const rawStructural = Math.min(100, Math.max(0, auditResults.structural?.score || 0));
    const rawAcademic = Math.min(100, Math.max(0, auditResults.academic?.score || 0));
    const rawPedagogical = Math.min(100, Math.max(0, auditResults.pedagogical?.score || 0));

    const prePenaltyScores = { structural: rawStructural, academic: rawAcademic, pedagogical: rawPedagogical };

    const structuralScore = Math.min(rawStructural, penaltyResult.structuralCap);
    const academicScore = Math.min(rawAcademic, penaltyResult.academicCap);
    const pedagogicalScore = Math.min(rawPedagogical, penaltyResult.pedagogicalCap);

    const overallScore = Math.round(
      structuralScore * RUBRIC.structural.weight +
      academicScore * RUBRIC.academic.weight +
      pedagogicalScore * RUBRIC.pedagogical.weight
    );

    // ============================================================
    // STEP 4: Build Certification Blockers (Specific Reasons)
    // ============================================================
    const certificationBlockers: string[] = [];

    if (structuralScore < CERT_THRESHOLDS.structural) {
      certificationBlockers.push(`Structural Integrity score ${structuralScore} < required ${CERT_THRESHOLDS.structural}`);
    }
    if (academicScore < CERT_THRESHOLDS.academic) {
      certificationBlockers.push(`Academic Rigor score ${academicScore} < required ${CERT_THRESHOLDS.academic}`);
    }
    if (pedagogicalScore < CERT_THRESHOLDS.pedagogical) {
      certificationBlockers.push(`Pedagogical Quality score ${pedagogicalScore} < required ${CERT_THRESHOLDS.pedagogical}`);
    }
    if (overallScore < CERT_THRESHOLDS.overall) {
      certificationBlockers.push(`Overall score ${overallScore} < required ${CERT_THRESHOLDS.overall}`);
    }

    // Add penalty-specific blockers
    for (const p of penaltyResult.penalties) {
      if (p.cap <= 70) {
        certificationBlockers.push(`Penalty ${p.rule}: ${p.evidence}`);
      }
    }

    const certificationEligible = certificationBlockers.length === 0;

    // Extract evidence citations
    const evidenceCitations = [
      ...(auditResults.structural?.findings || []),
      ...(auditResults.academic?.findings || []),
      ...(auditResults.pedagogical?.findings || []),
    ].filter((f: any) => f.quote && f.quote !== "N/A").map((f: any) => ({
      criterion: f.criterion,
      quote: f.quote,
      chapters: f.chapterNumbers,
    }));

    // Update audit record
    const { error: updateError } = await supabase.from("book_audits").update({
      structural_score: structuralScore,
      academic_score: academicScore,
      pedagogical_score: pedagogicalScore,
      overall_score: overallScore,
      structural_findings: auditResults.structural?.findings || [],
      academic_findings: auditResults.academic?.findings || [],
      pedagogical_findings: auditResults.pedagogical?.findings || [],
      flagged_sections: auditResults.flaggedSections || [],
      chapter_suggestions: auditResults.chapterSuggestions || [],
      penalty_log: penaltyResult.penalties,
      evidence_citations: evidenceCitations,
      pre_penalty_scores: prePenaltyScores,
      certification_eligible: certificationEligible,
      certification_blockers: certificationBlockers,
      audit_model: AUDIT_MODEL,
      audit_prompt_version: AUDIT_PROMPT_VERSION,
      status: "completed",
    }).eq("id", auditRecord.id);

    if (updateError) {
      log("Update error", { error: updateError.message });
      throw new Error(`Failed to save audit: ${updateError.message}`);
    }

    // ============================================================
    // STEP 5: Audit Telemetry
    // ============================================================
    const durationMs = Date.now() - auditStartTime;

    // Fetch previous audit for improvement delta
    const { data: prevAudits } = await supabase
      .from("book_audits")
      .select("overall_score, structural_score, academic_score, pedagogical_score")
      .eq("book_id", bookId)
      .eq("status", "completed")
      .neq("id", auditRecord.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const prevAudit = prevAudits?.[0];
    const improvementDelta = prevAudit ? {
      overall: overallScore - (prevAudit.overall_score || 0),
      structural: structuralScore - (prevAudit.structural_score || 0),
      academic: academicScore - (prevAudit.academic_score || 0),
      pedagogical: pedagogicalScore - (prevAudit.pedagogical_score || 0),
    } : null;

    await supabase.from("audit_telemetry").insert({
      audit_id: auditRecord.id,
      book_id: bookId,
      user_id: user.id,
      duration_ms: durationMs,
      chapters_audited: generatedChapters.length,
      penalties_applied: penaltyResult.penalties.length,
      certification_result: certificationEligible,
      score_before: prevAudit ? { s: prevAudit.structural_score, a: prevAudit.academic_score, p: prevAudit.pedagogical_score, o: prevAudit.overall_score } : {},
      score_after: { s: structuralScore, a: academicScore, p: pedagogicalScore, o: overallScore },
      improvement_delta: improvementDelta || {},
      audit_model: AUDIT_MODEL,
      prompt_version: AUDIT_PROMPT_VERSION,
    });

    log("Audit complete", {
      overall: overallScore,
      durationMs,
      improvementDelta,
      certEligible: certificationEligible,
      model: AUDIT_MODEL,
      promptVersion: AUDIT_PROMPT_VERSION,
    });

    return new Response(JSON.stringify({
      success: true,
      auditId: auditRecord.id,
      scores: { structural: structuralScore, academic: academicScore, pedagogical: pedagogicalScore, overall: overallScore },
      prePenaltyScores,
      penalties: penaltyResult.penalties,
      certificationEligible,
      certificationBlockers,
      certThresholds: CERT_THRESHOLDS,
      flaggedSections: auditResults.flaggedSections || [],
      chapterSuggestions: auditResults.chapterSuggestions || [],
      evidenceCitations: evidenceCitations.length,
      provenance: { model: AUDIT_MODEL, promptVersion: AUDIT_PROMPT_VERSION },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
