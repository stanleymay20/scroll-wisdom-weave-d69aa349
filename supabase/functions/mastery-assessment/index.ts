import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[MASTERY-ENGINE-V2] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// ============================================================
// LAYER 1 — CONCEPT EXTRACTION (TYPE-AWARE)
// ============================================================

const buildConceptExtractionPrompt = (bookType: string) => {
  const isProfessional = bookType === 'professional' || bookType === 'business';
  const isReference = bookType === 'reference';
  const isAcademic = bookType === 'academic' || bookType === 'technical';

  let specificInstruction = '';
  if (isProfessional) {
    specificInstruction = `
- Identify strategic frameworks (Porter, SWOT, etc.)
- Identify actionable decision criteria
- Identify measurable KPIs mentioned`;
  } else if (isReference) {
    specificInstruction = `
- Identify exact definitions of key terms
- Identify classification taxonomies
- Identify distinct categories or types`;
  } else if (isAcademic) {
    specificInstruction = `
- Identify formal theories and models
- Identify empirical findings/evidence
- Identify methodological constraints`;
  }

  return `You are a Concept Extraction Engine.

From the chapter below:

1. List 10–20 DISTINCT named constructs (theories, models, laws, effects, mechanisms, frameworks, principles).
2. Identify the 3 most intellectually dense mechanisms (explain WHY they are dense).
3. Identify 2 boundary conditions where a major idea weakens or fails.
4. Identify 2 assumptions the chapter relies on but does not explicitly defend.${specificInstruction}

Return structured JSON only.`;
};

// ============================================================
// LAYER 2 — BLOOM ENFORCEMENT CONTRACTS
// ============================================================

const BLOOM_ENFORCEMENT: Record<string, string> = {
  evaluate: `The question MUST use one of these structures:
- Trade-off reasoning between two valid approaches
- Design decision under constraint (choosing A vs B with specific limitations)
- Boundary condition failure analysis (When does this fail?)
- Counterfactual reasoning ("What if X were different?")
- Mechanism breakdown (WHY does this work, not just WHAT)
- Assumption challenge (What must be true for this to hold?)
NO EXCEPTIONS. Surface recall or definition questions are REJECTED.`,

  analyze: `The question MUST require:
- Decomposition of a system into parts
- Identification of cause-effect relationships
- Comparison of mechanisms or frameworks (A vs B)
- Pattern recognition across concepts
NOT just "which of the following" recall.`,

  apply: `The question MUST involve:
- A real scenario with specific parameters
- A parameter shift that changes the outcome
- Context variation from the chapter's examples
- Troubleshooting a specific failure case
NOT a restatement of the chapter content.`,

  create: `The question MUST require:
- Synthesizing a new framework from chapter concepts
- Designing an alternative solution to a problem
- Extending a theory to a novel domain
- Proposing a mitigation strategy for a risk
NOT selecting from pre-made options.`,

  understand: `The question MUST test:
- Explanation in the learner's own words
- Paraphrasing of mechanisms
- Distinguishing between similar concepts (Concept A vs Concept B)
NOT verbatim recall.`,

  remember: `The question tests factual recall of named constructs.
Use sparingly — maximum 1 per assessment.`,
};

// ============================================================
// LAYER 3 — QUESTION CONSTRUCTION CONTRACT
// ============================================================

function buildQuestionPrompt(
  bloomLevel: string,
  concepts: any,
  bookType: string,
  chapterTitle: string,
): string {
  const enforcement = BLOOM_ENFORCEMENT[bloomLevel] || BLOOM_ENFORCEMENT.analyze;
  
  // Select relevant concepts for this question type
  const relevantConcepts = concepts?.namedConstructs?.slice(0, 15) || [];
  
  return `You are the ScrollLibrary Mastery Engine v2.

You must generate ONE question aligned strictly to Bloom Level: ${bloomLevel.toUpperCase()}.

BLOOM ENFORCEMENT:
${enforcement}

EXTRACTED CONCEPTS (use at least 2):
${JSON.stringify(relevantConcepts, null, 2)}

DENSE MECHANISMS:
${JSON.stringify(concepts?.denseMechanisms || [], null, 2)}

BOUNDARY CONDITIONS:
${JSON.stringify(concepts?.boundaryConditions || [], null, 2)}

BOOK TYPE: ${bookType}
CHAPTER: ${chapterTitle}

Rules:
- Question must require reasoning, not recall.
- Must incorporate at least 2 named constructs from the extracted list.
- Must introduce either: a trade-off, a boundary case, a constraint, or a counterfactual.
- No definition questions.
- No "which is correct?"
- No surface recall.

If multiple choice:
- Distractors must be plausible.
- Each distractor must reflect a common misconception.
- Avoid trivial elimination.

Return JSON format with "question", "options", "correctIndex", "reasoningExplanation", "bloomJustification", "conceptsUsed", "questionType".`;
}

// ============================================================
// LAYER 4 — QUESTION STRESS-TEST (TYPE-AWARE)
// ============================================================

const buildStressTestPrompt = (bookType: string) => {
  return `You are a Question Quality Validator.

Evaluate this assessment question against these criteria:
1. Does it require mechanism-level reasoning? (not just recall)
2. Does it force trade-off evaluation or boundary analysis?
3. Can it be answered by trivial elimination of options?
4. Can it be answered with a single-sentence recall?
5. Are distractors plausible and based on common misconceptions?
6. Does it incorporate named constructs from the domain?

TYPE-SPECIFIC CHECKS ("${bookType}"):
${bookType === 'professional' ? '- Does it test actionable decision-making or framework application?' : 
  bookType === 'reference' ? '- Does it test precise distinction between similar concepts?' :
  bookType === 'academic' ? '- Does it test theoretical understanding or empirical evidence?' :
  '- Does it test deep understanding of the core mechanism?'}

If ANY of criteria 1-2 are NO, or if criteria 3-4 are YES, mark as FAIL.

Return JSON:
{
  "pass": true/false,
  "failReasons": ["..."],
  "strengthScore": 1-10
}`;
};

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const {
      chapterContent,
      chapterTitle,
      bookTitle,
      bookType = "text",
      bloomLevel = "analyze",
      questionCount = 5,
    } = await req.json();

    if (!chapterContent) {
      return new Response(JSON.stringify({ error: "chapterContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentSlice = chapterContent.slice(0, 15000); // Increased context window
    log("Starting mastery assessment", { bloomLevel, questionCount, bookType, contentLen: contentSlice.length });

    // ──────────────────────────────────────────────
    // STEP 1: Concept Extraction (semantic, AI-driven)
    // ──────────────────────────────────────────────
    log("Step 1: Concept Extraction");

    const extractionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite", // Fast model for extraction
        messages: [
          { role: "system", content: buildConceptExtractionPrompt(bookType) },
          { role: "user", content: contentSlice },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_concepts",
            description: "Extract named constructs, mechanisms, boundary conditions, and assumptions from chapter content.",
            parameters: {
              type: "object",
              properties: {
                namedConstructs: {
                  type: "array",
                  items: { type: "string" },
                  description: "10-20 distinct named theories, models, laws, effects, frameworks"
                },
                denseMechanisms: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      reason: { type: "string" }
                    },
                    required: ["name", "reason"],
                    additionalProperties: false
                  },
                  description: "3 most intellectually dense mechanisms with reasoning"
                },
                boundaryConditions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      concept: { type: "string" },
                      condition: { type: "string" }
                    },
                    required: ["concept", "condition"],
                    additionalProperties: false
                  },
                  description: "2 boundary conditions where ideas weaken or fail"
                },
                implicitAssumptions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      assumption: { type: "string" },
                      risk: { type: "string" }
                    },
                    required: ["assumption", "risk"],
                    additionalProperties: false
                  },
                  description: "2 assumptions the chapter relies on but doesn't defend"
                }
              },
              required: ["namedConstructs", "denseMechanisms", "boundaryConditions", "implicitAssumptions"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_concepts" } }
      }),
    });

    let concepts: any = {
      namedConstructs: [],
      denseMechanisms: [],
      boundaryConditions: [],
      implicitAssumptions: [],
    };

    if (extractionResp.ok) {
      const extractData = await extractionResp.json();
      try {
        const args = extractData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) concepts = JSON.parse(args);
        log("Concepts extracted", {
          constructs: concepts.namedConstructs?.length || 0,
          mechanisms: concepts.denseMechanisms?.length || 0,
        });
      } catch (e) {
        log("Concept extraction parse failed, using empty", { error: String(e) });
      }
    } else {
      const errText = await extractionResp.text();
      log("Concept extraction failed", { status: extractionResp.status, error: errText });
      if (extractionResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (extractionResp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ──────────────────────────────────────────────
    // STEP 2: Generate Questions with Bloom Enforcement
    // ──────────────────────────────────────────────
    log("Step 2: Question Generation with Bloom Enforcement");

    // Bloom distribution for the assessment
    const bloomDistribution = buildBloomDistribution(questionCount, bloomLevel);
    log("Bloom distribution", bloomDistribution);

    // Generate all questions in a single batch call to save tokens/time
    const batchPrompt = `Generate exactly ${questionCount} mastery assessment questions for the chapter "${chapterTitle}" from "${bookTitle}".

CHAPTER CONTENT:
${contentSlice.slice(0, 8000)}

EXTRACTED CONCEPTS:
${JSON.stringify(concepts, null, 2)}

For each question, follow the specific Bloom level enforcement below.

${bloomDistribution.map((bl: string, i: number) => `
QUESTION ${i + 1} — Bloom Level: ${bl.toUpperCase()}
${BLOOM_ENFORCEMENT[bl] || BLOOM_ENFORCEMENT.analyze}
`).join('\n')}

UNIVERSAL RULES:
- Every question must reference at least 2 named constructs from the extracted list.
- Every question must introduce a trade-off, boundary case, constraint, or counterfactual.
- No definition questions. No "which is correct?" No surface recall.
- Distractors must reflect common misconceptions, not obviously wrong answers.
- Book type: "${bookType}" — preserve stylistic conventions.`;

    const genResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Smarter model for generation
        messages: [
          { role: "system", content: "You are the ScrollLibrary Mastery Engine v2. Generate intellectually rigorous assessment questions." },
          { role: "user", content: batchPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_mastery_questions",
            description: "Generate mastery assessment questions with Bloom enforcement",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      bloomLevel: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"] },
                      question: { type: "string" },
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: "number" },
                      reasoningExplanation: { type: "string", description: "Detailed mechanism-level explanation of why the answer is correct" },
                      bloomJustification: { type: "string", description: "Why this question qualifies for its Bloom level" },
                      conceptsUsed: { type: "array", items: { type: "string" }, description: "Named constructs referenced in this question" },
                      questionType: { type: "string", enum: ["trade-off", "boundary-case", "constraint", "counterfactual", "mechanism-breakdown", "assumption-challenge"] },
                      difficulty: { type: "number", description: "1-6 difficulty scale" },
                      pointValue: { type: "number" },
                      timeLimit: { type: "number" }
                    },
                    required: ["bloomLevel", "question", "options", "correctIndex", "reasoningExplanation", "bloomJustification", "conceptsUsed", "questionType", "difficulty", "pointValue", "timeLimit"],
                    additionalProperties: false
                  }
                }
              },
              required: ["questions"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_mastery_questions" } }
      }),
    });

    let questions: any[] = [];

    if (!genResp.ok) {
      const errText = await genResp.text();
      log("Question generation failed", { status: genResp.status, error: errText });
      if (genResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (genResp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Fall through to use fallback
    } else {
      const genData = await genResp.json();
      try {
        const args = genData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) {
          const parsed = JSON.parse(args);
          questions = parsed.questions || [];
        }
      } catch (e) {
        log("Question parse failed", { error: String(e) });
      }
    }

    log("Questions generated", { count: questions.length });

    // ──────────────────────────────────────────────
    // STEP 3: Question Stress-Test (validate quality)
    // ──────────────────────────────────────────────
    if (questions.length > 0) {
      log("Step 3: Question Stress-Test");

      const stressResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite", // Fast model for validation
          messages: [
            { role: "system", content: buildStressTestPrompt(bookType) },
            { role: "user", content: `Evaluate these ${questions.length} questions:\n${JSON.stringify(questions.map((q: any, i: number) => ({
              index: i,
              bloomLevel: q.bloomLevel,
              question: q.question,
              options: q.options,
            })), null, 2)}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "stress_test_results",
              description: "Results of question quality stress-test",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        pass: { type: "boolean" },
                        strengthScore: { type: "number" },
                        failReasons: { type: "array", items: { type: "string" } }
                      },
                      required: ["index", "pass", "strengthScore"],
                      additionalProperties: false
                    }
                  },
                  overallDepthScore: { type: "number", description: "Average depth score 1-10" }
                },
                required: ["results", "overallDepthScore"],
                additionalProperties: false
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "stress_test_results" } }
        }),
      });

      let stressResults: any = null;
      if (stressResp.ok) {
        const stressData = await stressResp.json();
        try {
          const args = stressData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (args) stressResults = JSON.parse(args);
        } catch (e) {
          log("Stress-test parse failed", { error: String(e) });
        }
      } else {
        await stressResp.text(); // consume body
      }

      if (stressResults?.results) {
        // Tag each question with its stress-test result
        for (const result of stressResults.results) {
          if (result.index >= 0 && result.index < questions.length) {
            questions[result.index].stressTestPass = result.pass;
            questions[result.index].strengthScore = result.strengthScore;
            questions[result.index].stressTestFailReasons = result.failReasons || [];
          }
        }

        const passCount = stressResults.results.filter((r: any) => r.pass).length;
        log("Stress-test complete", {
          passed: passCount,
          total: stressResults.results.length,
          overallDepth: stressResults.overallDepthScore,
        });
      }
    }

    // ──────────────────────────────────────────────
    // STEP 4: Normalize and compute mastery depth
    // ──────────────────────────────────────────────
    log("Step 4: Compute mastery depth score");

    // Normalize questions
    questions = questions.map((q: any, idx: number) => ({
      bloomLevel: q.bloomLevel || bloomDistribution[idx] || "analyze",
      question: q.question || `Question ${idx + 1}`,
      options: Array.isArray(q.options) && q.options.length >= 4 ? q.options.slice(0, 4) : ["A", "B", "C", "D"],
      correctIndex: typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex <= 3 ? q.correctIndex : 0,
      reasoningExplanation: q.reasoningExplanation || q.explanation || "Correct based on chapter content.",
      bloomJustification: q.bloomJustification || `This question targets the ${q.bloomLevel || "analyze"} level of Bloom's taxonomy.`,
      conceptsUsed: Array.isArray(q.conceptsUsed) ? q.conceptsUsed : [],
      questionType: q.questionType || "mechanism-breakdown",
      difficulty: q.difficulty || 3,
      pointValue: q.pointValue || (q.bloomLevel === "evaluate" ? 7 : q.bloomLevel === "analyze" ? 5 : q.bloomLevel === "apply" ? 3 : 1),
      timeLimit: q.timeLimit || 120,
      stressTestPass: q.stressTestPass ?? true,
      strengthScore: q.strengthScore ?? 5,
      stressTestFailReasons: q.stressTestFailReasons || [],
    }));

    // Compute mastery depth score (scaled 0-100)
    const depthScores = questions.map((q: any) => q.strengthScore || 5);
    const masteryDepthScore = depthScores.length > 0
      ? Math.round((depthScores.reduce((a: number, b: number) => a + b, 0) / depthScores.length) * 10)
      : 50;

    const hasEvaluateOrCreate = questions.some(
      (q: any) => q.bloomLevel === "evaluate" || q.bloomLevel === "create"
    );

    const totalPoints = questions.reduce((sum: number, q: any) => sum + q.pointValue, 0);

    const result = {
      success: true,
      questions,
      concepts,
      masteryDepthScore,
      hasEvaluateOrCreate,
      totalPoints,
      bloomDistribution: bloomDistribution.reduce((acc: any, bl: string) => {
        acc[bl] = (acc[bl] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      stressTestSummary: {
        passed: questions.filter((q: any) => q.stressTestPass).length,
        total: questions.length,
        averageStrength: depthScores.length > 0
          ? Math.round((depthScores.reduce((a: number, b: number) => a + b, 0) / depthScores.length) * 10) / 10
          : 0,
      },
    };

    log("Mastery assessment complete", {
      questions: result.questions.length,
      depth: result.masteryDepthScore,
      hasEvalCreate: result.hasEvaluateOrCreate,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// BLOOM DISTRIBUTION BUILDER
// ============================================================

function buildBloomDistribution(count: number, primaryLevel: string): string[] {
  // Ensure we always include evaluate-level and diverse bloom coverage
  const distribution: string[] = [];

  if (count >= 7) {
    // Full assessment: 1 remember, 1 understand, 1 apply, 2 analyze, 1 evaluate, 1 create
    distribution.push("remember", "understand", "apply", "analyze", "analyze", "evaluate", "create");
  } else if (count >= 5) {
    // Standard: 1 understand, 1 apply, 1 analyze, 1 evaluate, 1 based on primary
    distribution.push("understand", "apply", "analyze", "evaluate", primaryLevel);
  } else if (count >= 3) {
    // Minimal: 1 apply, 1 analyze, 1 evaluate
    distribution.push("apply", "analyze", "evaluate");
  } else {
    // Very minimal: analyze + evaluate
    distribution.push("analyze", "evaluate");
  }

  // Pad to requested count
  const highLevels = ["analyze", "evaluate", "apply"];
  while (distribution.length < count) {
    distribution.push(highLevels[distribution.length % highLevels.length]);
  }

  return distribution.slice(0, count);
}
