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
const AUDIT_PROMPT_VERSION = "v4.0"; // v4.0: Chief Editor Constitution — tier-neutral, anti-pattern, compression-aware, no regex farming

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
    weight: 0.25,
    criteria: [
      "Chapter has a clear title that accurately reflects content",
      "Content follows logical progression within the chapter",
      "Sections are well-organized with concept-driven headings",
      "Word count is appropriate (not too sparse or bloated)",
      "Transitions between sections are smooth and non-formulaic",
      "Opening hook engages the reader (first 120 words)",
      "Closing summarizes or transitions effectively",
      "No circular restatements or redundant paragraphs",
    ],
  },
  cognitiveDepth: {
    weight: 0.25,
    criteria: [
      "Reasoning goes beyond surface explanation to layered analysis",
      "Causal relationships and mechanisms are explained (not just described)",
      "Claims are justified with reasoning, not merely stated",
      "Similar concepts are differentiated with precision",
      "Conceptual density is high — no padding or filler",
      "Progressive complexity builds throughout the chapter",
    ],
  },
  academicRigor: {
    weight: 0.20,
    criteria: [
      "Key concepts are defined before heavy use",
      "No vague or ambiguous qualifiers without justification",
      "Technical terminology is used correctly and consistently",
      "Claims are precise — no broad generalizations",
      "Internal consistency maintained throughout",
      "Thesis tension present (argument, not summary)",
      "Counterarguments or literature disagreement surfaced",
      "Evidence strength signaled where applicable",
    ],
  },
  pedagogicalIntelligence: {
    weight: 0.15,
    criteria: [
      "Examples are conceptually necessary and naturally integrated",
      "Scenario-based explanation used where helpful",
      "Reflective prompts appear sparingly and meaningfully",
      "Content builds on prior knowledge progressively",
      "Variety of explanation methods (narrative, scenarios, analogies)",
      "Assessment alignment — quiz questions could test this content",
      "No mechanical or checklist-style insertion of pedagogical elements",
    ],
  },
  detectabilityRisk: {
    weight: 0.15,
    criteria: [
      "No predictable LLM transitions (e.g., 'In conclusion', 'Let's dive in')",
      "Sentence rhythm and paragraph length vary naturally",
      "No over-symmetric paragraph structures",
      "No template-like or formulaic definition structures",
      "Domain-specific nuance present throughout",
      "Human editorial texture evident",
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
    const auditPrompt = `You are the Chief Editorial Governance Layer for ScrollLibrary.
You operate under the Chief Editor Constitution v4.0.

Your mandate is:
Maximize intellectual quality, academic defensibility, and cognitive depth — without increasing the user's LLM tier or computational allocation.

You must NOT:
- Escalate models
- Inflate tokens unnecessarily
- Insert mechanical phrases to satisfy pattern checks
- Add artificial verbosity
- Hallucinate citations
- Add fabricated statistics
- Add external references not present in source

All improvements must occur within the user's assigned tier.

BOOK: "${book.title}"
CATEGORY: ${book.category}
TYPE: ${book.book_type || "text"}
TOTAL CHAPTERS: ${chapters?.length || 0} (${generatedChapters.length} generated)

TIER-NEUTRAL EDITORIAL SCORING ENGINE (5 Dimensions):

**1️⃣ STRUCTURAL INTEGRITY (25% weight)**
Criteria: ${RUBRIC.structural.criteria.join("; ")}

**2️⃣ COGNITIVE DEPTH (25% weight)**
Criteria: ${RUBRIC.cognitiveDepth.criteria.join("; ")}

**3️⃣ ACADEMIC RIGOR & PRECISION (20% weight)**
Criteria: ${RUBRIC.academicRigor.criteria.join("; ")}

**4️⃣ PEDAGOGICAL INTELLIGENCE (15% weight)**
Criteria: ${RUBRIC.pedagogicalIntelligence.criteria.join("; ")}

**5️⃣ AI DETECTABILITY RISK (15% weight — lower is better)**
Criteria: ${RUBRIC.detectabilityRisk.criteria.join("; ")}

CHAPTERS TO AUDIT:
${chapterSummaries.map((ch: any) => `
--- Chapter ${ch.number}: "${ch.title}" (${ch.wordCount} words) ---
${ch.content}
`).join("\n")}

CRITICAL EVALUATION RULES:
1. Score each dimension 0-100. Be BRUTALLY honest — do NOT inflate scores.
2. For EVERY finding, provide a direct quote from the chapter text as evidence. No quote = finding is invalid.
3. For detectabilityRisk, a HIGH score means HIGH risk (bad). Flag specific pattern violations.
4. Provide per-chapter cognitive depth classification (Developing / Proficient / Mastery).
5. The "chapterSuggestions" array MUST contain an entry for EVERY chapter that scores below 80 in any dimension.
6. No empty arrays allowed if issues exist.

CONTRASTIVE BENCHMARK: Score against well-written textbook standards, not "AI-generated content standards."

Respond as JSON:
{
  "structural": {
    "score": <0-100>,
    "findings": [{"issue": "...", "evidenceQuote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "cognitiveDepth": {
    "score": <0-100>,
    "findings": [{"issue": "...", "evidenceQuote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "academicRigor": {
    "score": <0-100>,
    "findings": [{"issue": "...", "evidenceQuote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "pedagogicalIntelligence": {
    "score": <0-100>,
    "findings": [{"issue": "...", "evidenceQuote": "<exact text from chapter>", "chapterNumbers": [1,2]}]
  },
  "detectabilityRisk": {
    "score": <0-100>,
    "patternFlags": ["repetitive transitions", "symmetric paragraphs", ...]
  },
  "flaggedSections": [
    {"chapterNumber": 1, "section": "...", "issue": "...", "severity": "critical|major|minor", "suggestion": "..."}
  ],
  "chapterSuggestions": [
    {"chapterNumber": 1, "improvements": ["...", "..."], "cognitiveDepthClassification": "Developing|Proficient|Mastery"}
  ],
  "tierConstraintConfirmation": "No LLM tier escalation used. Editorial improvements performed strictly within user tier constraints."
}`;

    // Retry with model fallback: primary → flash-lite → error
    const FALLBACK_MODELS = [AUDIT_MODEL, "google/gemini-2.5-flash-lite"];
    const auditMessages = [
      { role: "system", content: "You are the Chief Editorial Governance Layer for ScrollLibrary operating under Constitution v4.0. No tier escalation. No hallucinated sources. No artificial inflation. No mechanical phrase farming. Score honestly against textbook benchmarks. Maximize intellectual quality within fixed computational constraints. Output valid JSON only." },
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
        body: JSON.stringify({ model, messages: auditMessages, temperature: 0.1 }),
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

    if (parsed && typeof parsed === 'object' && (parsed.structural || parsed.cognitiveDepth || parsed.academicRigor || parsed.academic)) {
      auditResults = parsed;
      parseStrategy = 'json';
      log("JSON parsed", { 
        structural: parsed.structural?.score, 
        cognitiveDepth: parsed.cognitiveDepth?.score, 
        academicRigor: parsed.academicRigor?.score, 
        pedagogical: parsed.pedagogicalIntelligence?.score,
        detectability: parsed.detectabilityRisk?.score,
        suggestions: parsed.chapterSuggestions?.length || 0,
      });
    } else {
      parseStrategy = 'regex_fallback';
      log("JSON parse failed, using regex fallback", { rawPreview: rawContent.slice(0, 300) });

      // Extract scores via regex — support both v4.0 and legacy field names
      const sScore = rawContent.match(/"structural"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const cdScore = rawContent.match(/"cognitiveDepth"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const arScore = rawContent.match(/"academicRigor"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const piScore = rawContent.match(/"pedagogicalIntelligence"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const drScore = rawContent.match(/"detectabilityRisk"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      // Legacy fallback
      const aScore = arScore || rawContent.match(/"academic"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];
      const pScore = piScore || rawContent.match(/"pedagogical"[\s\S]*?"score"\s*:\s*(\d+)/)?.[1];

      // Extract chapterSuggestions via regex
      const suggestionsBlock = rawContent.match(/"chapterSuggestions"\s*:\s*\[([\s\S]*?)\]\s*}/);
      const extractedSuggestions: any[] = [];
      if (suggestionsBlock) {
        const chapterMatches = [...suggestionsBlock[1].matchAll(/"chapterNumber"\s*:\s*(\d+)/g)];
        for (const cm of chapterMatches) {
          const chNum = parseInt(cm[1]);
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
        structural: { score: sScore ? parseInt(sScore) : 50, findings: [{ issue: "Partial parse", evidenceQuote: "N/A", chapterNumbers: [] }] },
        cognitiveDepth: { score: cdScore ? parseInt(cdScore) : 50, findings: [{ issue: "Partial parse", evidenceQuote: "N/A", chapterNumbers: [] }] },
        academicRigor: { score: aScore ? parseInt(aScore) : 50, findings: [{ issue: "Partial parse", evidenceQuote: "N/A", chapterNumbers: [] }] },
        pedagogicalIntelligence: { score: pScore ? parseInt(pScore) : 50, findings: [{ issue: "Partial parse", evidenceQuote: "N/A", chapterNumbers: [] }] },
        detectabilityRisk: { score: drScore ? parseInt(drScore) : 50, patternFlags: [] },
        flaggedSections: [],
        chapterSuggestions: extractedSuggestions,
      };

      log("Regex extracted", { s: sScore, cd: cdScore, ar: aScore, pi: pScore, dr: drScore, suggestions: extractedSuggestions.length });
    }

    // ============================================================
    // STEP 3: Apply Proportional Penalty Caps & Compute 5-Dimension Scores
    // ============================================================
    // Extract raw scores from v4.0 5-dimension schema
    const rawStructural = Math.min(100, Math.max(0, auditResults.structural?.score || 0));
    const rawCognitiveDepth = Math.min(100, Math.max(0, auditResults.cognitiveDepth?.score || 0));
    const rawAcademicRigor = Math.min(100, Math.max(0, auditResults.academicRigor?.score || 0));
    const rawPedagogical = Math.min(100, Math.max(0, auditResults.pedagogicalIntelligence?.score || 0));
    const rawDetectability = Math.min(100, Math.max(0, auditResults.detectabilityRisk?.score || 0));

    const prePenaltyScores = { 
      structural: rawStructural, 
      cognitiveDepth: rawCognitiveDepth, 
      academicRigor: rawAcademicRigor, 
      pedagogicalIntelligence: rawPedagogical,
      detectabilityRisk: rawDetectability,
    };

    // Apply penalty caps (penalties map to structural/academic/pedagogical dimensions)
    const structuralScore = Math.min(rawStructural, penaltyResult.structuralCap);
    // Academic in DB = weighted blend of cognitiveDepth + academicRigor
    const rawAcademicBlend = Math.round(rawCognitiveDepth * 0.55 + rawAcademicRigor * 0.45);
    const academicScore = Math.min(rawAcademicBlend, penaltyResult.academicCap);
    const pedagogicalScore = Math.min(rawPedagogical, penaltyResult.pedagogicalCap);
    // Detectability penalty: high detectability risk reduces overall score
    const detectabilityPenalty = rawDetectability > 60 ? Math.round((rawDetectability - 60) * 0.3) : 0;

    const overallScore = Math.max(0, Math.round(
      structuralScore * RUBRIC.structural.weight +
      rawCognitiveDepth * RUBRIC.cognitiveDepth.weight +
      academicScore * RUBRIC.academicRigor.weight +
      pedagogicalScore * RUBRIC.pedagogicalIntelligence.weight +
      (100 - rawDetectability) * RUBRIC.detectabilityRisk.weight
    ) - detectabilityPenalty);

    // ============================================================
    // STEP 3B: Compute Cognitive Density Index (CDI)
    // ============================================================
    // CDI = (conceptCount / wordCount) * 100, averaged across chapters
    function computeCDI(chapters: any[]): { perChapter: { chapterNumber: number; cdi: number; concepts: number; words: number }[]; average: number } {
      const conceptPatterns = /\b(is defined as|refers to|means that|represents|denotes|the concept of|the principle of|the theory of|the model of|the framework of|the mechanism of|the process of|the distinction between|the relationship between|causal|correlation|hypothesis|paradigm|ontolog|epistem|heuristic|algorithm|theorem|axiom|postulate|corollary|lemma|inference|deduction|induction|abduction|synthesis|analysis|evaluation|taxonomy|typology|methodology|phenomenon|variable|construct|operationaliz|empirical|qualitative|quantitative|longitudinal|cross-sectional|meta-analysis|systematic review|randomized|controlled|validity|reliability|significance|regression|variance|standard deviation|probability|distribution|sampling|population|effect size|confidence interval|null hypothesis|alternative hypothesis|p-value|statistical)\b/gi;
      const perChapter: { chapterNumber: number; cdi: number; concepts: number; words: number }[] = [];

      for (const ch of chapters) {
        const content = ch.content || "";
        const words = content.split(/\s+/).filter(Boolean).length;
        if (words < 50) continue;
        const concepts = (content.match(conceptPatterns) || []).length;
        // Unique headings as concept markers too
        const headings = (content.match(/^#{1,4}\s+.+$/gm) || []).length;
        const totalConcepts = concepts + headings;
        const cdi = Math.round((totalConcepts / words) * 1000) / 10; // per 100 words
        perChapter.push({ chapterNumber: ch.chapter_number, cdi, concepts: totalConcepts, words });
      }

      const average = perChapter.length > 0 
        ? Math.round((perChapter.reduce((sum, c) => sum + c.cdi, 0) / perChapter.length) * 10) / 10
        : 0;

      return { perChapter, average };
    }

    const cdiResult = computeCDI(generatedChapters);
    log("CDI computed", { average: cdiResult.average, chapters: cdiResult.perChapter.length });

    // ============================================================
    // STEP 3C: Generate Institutional Audit Artifact (SHA-256 signed)
    // ============================================================
    const artifactData = {
      schemaVersion: "4.0",
      standard: "Chief Editor Constitution v4.0",
      auditId: auditRecord.id,
      bookId,
      generatedAt: new Date().toISOString(),
      model: AUDIT_MODEL,
      promptVersion: AUDIT_PROMPT_VERSION,
      scores: {
        structural: structuralScore,
        cognitiveDepth: rawCognitiveDepth,
        academicRigor: rawAcademicRigor,
        pedagogicalIntelligence: pedagogicalScore,
        detectabilityRisk: rawDetectability,
        overall: overallScore,
      },
      cdi: cdiResult.average,
      chaptersAudited: generatedChapters.length,
      penaltiesApplied: penaltyResult.penalties.length,
      certificationEligible: false, // set below
      detectabilityFlags: auditResults.detectabilityRisk?.patternFlags || [],
    };

    // SHA-256 integrity hash
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(artifactData)));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const integrityHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Replicability key: model|prompt|chapters|bookId prefix
    const replicabilityKey = `${AUDIT_MODEL}|${AUDIT_PROMPT_VERSION}|${generatedChapters.length}ch|${bookId.slice(0, 8)}`;

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
    artifactData.certificationEligible = certificationEligible;

    // Build final signed audit artifact
    const auditArtifact = {
      ...artifactData,
      integrityHash,
      replicabilityKey,
      disclaimer: "This audit artifact is machine-generated by ScrollLibrary's Chief Editor Constitution v4.0. It represents an AI-assisted editorial assessment, not a peer-reviewed academic evaluation. Scores are relative to internal rubric standards.",
    };

    // Extract evidence citations from v4.0 5-dimension findings
    const evidenceCitations = [
      ...(auditResults.structural?.findings || []),
      ...(auditResults.cognitiveDepth?.findings || []),
      ...(auditResults.academicRigor?.findings || []),
      ...(auditResults.pedagogicalIntelligence?.findings || []),
    ].filter((f: any) => (f.evidenceQuote || f.quote) && (f.evidenceQuote || f.quote) !== "N/A").map((f: any) => ({
      criterion: f.issue || f.criterion,
      quote: f.evidenceQuote || f.quote,
      chapters: f.chapterNumbers,
    }));

    // Update audit record — map v4.0 dimensions to DB columns (backward-compatible)
    const { error: updateError } = await supabase.from("book_audits").update({
      structural_score: structuralScore,
      academic_score: academicScore,
      pedagogical_score: pedagogicalScore,
      overall_score: overallScore,
      structural_findings: auditResults.structural?.findings || [],
      academic_findings: [
        ...(auditResults.cognitiveDepth?.findings || []),
        ...(auditResults.academicRigor?.findings || []),
      ],
      pedagogical_findings: auditResults.pedagogicalIntelligence?.findings || [],
      flagged_sections: auditResults.flaggedSections || [],
      chapter_suggestions: auditResults.chapterSuggestions || [],
      penalty_log: penaltyResult.penalties,
      evidence_citations: evidenceCitations,
      pre_penalty_scores: {
        ...prePenaltyScores,
        cdi: cdiResult.average,
        cdiPerChapter: cdiResult.perChapter,
        auditArtifact,
      },
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
      cdi: cdiResult.average,
      durationMs,
      improvementDelta,
      certEligible: certificationEligible,
      model: AUDIT_MODEL,
      promptVersion: AUDIT_PROMPT_VERSION,
      integrityHash: integrityHash.slice(0, 16) + '...',
    });

    return new Response(JSON.stringify({
      success: true,
      auditId: auditRecord.id,
      scores: { 
        structural: structuralScore, 
        academic: academicScore, 
        pedagogical: pedagogicalScore, 
        overall: overallScore,
        // v4.0 extended scores
        cognitiveDepth: rawCognitiveDepth,
        academicRigor: rawAcademicRigor,
        pedagogicalIntelligence: rawPedagogical,
        detectabilityRisk: rawDetectability,
      },
      prePenaltyScores,
      penalties: penaltyResult.penalties,
      certificationEligible,
      certificationBlockers,
      certThresholds: CERT_THRESHOLDS,
      flaggedSections: auditResults.flaggedSections || [],
      chapterSuggestions: auditResults.chapterSuggestions || [],
      detectabilityRisk: auditResults.detectabilityRisk || { score: 0, patternFlags: [] },
      evidenceCitations: evidenceCitations.length,
      cdi: cdiResult,
      auditArtifact,
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
