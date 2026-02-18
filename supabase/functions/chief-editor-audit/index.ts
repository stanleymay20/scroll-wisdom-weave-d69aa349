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
// DETERMINISTIC PENALTY ENGINE (Pre-AI, Hard Rules)
// ============================================================
interface PenaltyResult {
  structuralCap: number;
  academicCap: number;
  pedagogicalCap: number;
  penalties: Array<{ dimension: string; rule: string; cap: number; evidence: string }>;
}

function computeDeterministicPenalties(chapters: any[]): PenaltyResult {
  let structuralCap = 100;
  let academicCap = 100;
  let pedagogicalCap = 100;
  const penalties: PenaltyResult["penalties"] = [];

  for (const ch of chapters) {
    const content = ch.content || "";
    const wordCount = ch.word_count || content.split(/\s+/).filter(Boolean).length;
    const chLabel = `Ch.${ch.chapter_number}`;

    // STRUCTURAL: Word count < 800 → cap at 60
    if (wordCount < 800) {
      structuralCap = Math.min(structuralCap, 60);
      penalties.push({
        dimension: "structural",
        rule: "WORD_COUNT_LOW",
        cap: 60,
        evidence: `${chLabel}: ${wordCount} words (minimum 800)`,
      });
    }

    // STRUCTURAL: Word count < 400 → cap at 40
    if (wordCount < 400) {
      structuralCap = Math.min(structuralCap, 40);
      penalties.push({
        dimension: "structural",
        rule: "WORD_COUNT_CRITICAL",
        cap: 40,
        evidence: `${chLabel}: ${wordCount} words (critically low)`,
      });
    }

    // PEDAGOGICAL: No examples detected → cap at 65
    const examplePatterns = /\b(for example|e\.g\.|for instance|such as|consider|let's say|imagine|suppose)\b/gi;
    const exampleCount = (content.match(examplePatterns) || []).length;
    if (exampleCount === 0) {
      pedagogicalCap = Math.min(pedagogicalCap, 65);
      penalties.push({
        dimension: "pedagogical",
        rule: "NO_EXAMPLES",
        cap: 65,
        evidence: `${chLabel}: Zero examples or illustrative phrases detected`,
      });
    }

    // ACADEMIC: No definitions detected → cap at 70
    const definitionPatterns = /\b(is defined as|refers to|means that|can be described as|is a|are called)\b/gi;
    const definitionCount = (content.match(definitionPatterns) || []).length;
    if (definitionCount === 0) {
      academicCap = Math.min(academicCap, 70);
      penalties.push({
        dimension: "academic",
        rule: "NO_DEFINITIONS",
        cap: 70,
        evidence: `${chLabel}: No key concept definitions detected`,
      });
    }

    // STRUCTURAL: No headings detected → cap at 55
    const headingCount = (content.match(/^#{1,4}\s/gm) || []).length;
    if (headingCount < 2 && wordCount > 500) {
      structuralCap = Math.min(structuralCap, 55);
      penalties.push({
        dimension: "structural",
        rule: "NO_STRUCTURE",
        cap: 55,
        evidence: `${chLabel}: Only ${headingCount} headings for ${wordCount} words`,
      });
    }

    // PEDAGOGICAL: No questions or exercises → cap at 70
    const questionCount = (content.match(/\?/g) || []).length;
    const exercisePatterns = /\b(exercise|try it|practice|quiz|question|task|activity|challenge)\b/gi;
    const exerciseCount = (content.match(exercisePatterns) || []).length;
    if (questionCount === 0 && exerciseCount === 0) {
      pedagogicalCap = Math.min(pedagogicalCap, 70);
      penalties.push({
        dimension: "pedagogical",
        rule: "NO_ENGAGEMENT",
        cap: 70,
        evidence: `${chLabel}: No questions or exercises detected`,
      });
    }
  }

  return { structuralCap, academicCap, pedagogicalCap, penalties };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    // STEP 1: Deterministic Penalties (Hard Rules, Pre-AI)
    // ============================================================
    const penaltyResult = computeDeterministicPenalties(generatedChapters);
    log("Penalties computed", {
      caps: { s: penaltyResult.structuralCap, a: penaltyResult.academicCap, p: penaltyResult.pedagogicalCap },
      count: penaltyResult.penalties.length,
    });

    // Create audit record with 'running' status
    const { data: auditRecord, error: insertError } = await supabase
      .from("book_audits").insert({
        book_id: bookId,
        user_id: user.id,
        status: "running",
        penalty_log: penaltyResult.penalties,
      }).select().single();

    if (insertError) throw new Error(`Failed to create audit: ${insertError.message}`);

    log("Audit started", { auditId: auditRecord.id.slice(0, 8), chapters: generatedChapters.length });

    // Build chapter summaries for AI (truncate to fit context)
    const chapterSummaries = generatedChapters.map((ch: any) => ({
      number: ch.chapter_number,
      title: ch.title,
      wordCount: ch.word_count || 0,
      content: (ch.content || "").slice(0, 4000),
    }));

    // ============================================================
    // STEP 2: AI Evaluation with Contrastive Evidence Requirement
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

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a rigorous academic editor. Score honestly against textbook benchmarks. Never inflate. Every score MUST have a direct quote from the text as evidence. Output valid JSON only." },
          { role: "user", content: auditPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      await aiResponse.text();
      log("AI error", { status });

      await supabase.from("book_audits").update({ status: "failed" }).eq("id", auditRecord.id);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let auditResults;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      auditResults = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (!auditResults) throw new Error("No JSON found");
    } catch (parseErr) {
      log("Parse error, using fallback", { error: String(parseErr) });
      auditResults = {
        structural: { score: 50, findings: [{ criterion: "Parse error", assessment: "Could not parse AI response", quote: "N/A", chapterNumbers: [] }] },
        academic: { score: 50, findings: [{ criterion: "Parse error", assessment: "Could not parse AI response", quote: "N/A", chapterNumbers: [] }] },
        pedagogical: { score: 50, findings: [{ criterion: "Parse error", assessment: "Could not parse AI response", quote: "N/A", chapterNumbers: [] }] },
        flaggedSections: [],
        chapterSuggestions: [],
      };
    }

    // ============================================================
    // STEP 3: Apply Deterministic Penalty Caps to AI Scores
    // ============================================================
    const rawStructural = Math.min(100, Math.max(0, auditResults.structural?.score || 0));
    const rawAcademic = Math.min(100, Math.max(0, auditResults.academic?.score || 0));
    const rawPedagogical = Math.min(100, Math.max(0, auditResults.pedagogical?.score || 0));

    // Store pre-penalty scores for transparency
    const prePenaltyScores = {
      structural: rawStructural,
      academic: rawAcademic,
      pedagogical: rawPedagogical,
    };

    // Apply hard caps
    const structuralScore = Math.min(rawStructural, penaltyResult.structuralCap);
    const academicScore = Math.min(rawAcademic, penaltyResult.academicCap);
    const pedagogicalScore = Math.min(rawPedagogical, penaltyResult.pedagogicalCap);

    const overallScore = Math.round(
      structuralScore * RUBRIC.structural.weight +
      academicScore * RUBRIC.academic.weight +
      pedagogicalScore * RUBRIC.pedagogical.weight
    );

    // ============================================================
    // STEP 4: Certification Eligibility Check
    // ============================================================
    const certificationEligible =
      structuralScore >= CERT_THRESHOLDS.structural &&
      academicScore >= CERT_THRESHOLDS.academic &&
      pedagogicalScore >= CERT_THRESHOLDS.pedagogical &&
      overallScore >= CERT_THRESHOLDS.overall;

    // Extract evidence citations from findings
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
      status: "completed",
    }).eq("id", auditRecord.id);

    if (updateError) {
      log("Update error", { error: updateError.message });
      throw new Error(`Failed to save audit: ${updateError.message}`);
    }

    log("Audit complete", {
      overall: overallScore,
      raw: prePenaltyScores,
      capped: { structural: structuralScore, academic: academicScore, pedagogical: pedagogicalScore },
      penalties: penaltyResult.penalties.length,
      certEligible: certificationEligible,
    });

    return new Response(JSON.stringify({
      success: true,
      auditId: auditRecord.id,
      scores: { structural: structuralScore, academic: academicScore, pedagogical: pedagogicalScore, overall: overallScore },
      prePenaltyScores,
      penalties: penaltyResult.penalties,
      certificationEligible,
      certThresholds: CERT_THRESHOLDS,
      flaggedSections: auditResults.flaggedSections || [],
      chapterSuggestions: auditResults.chapterSuggestions || [],
      evidenceCitations: evidenceCitations.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
