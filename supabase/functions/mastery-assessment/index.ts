import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[MASTERY-ENGINE-V2] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// ============================================================
// BOOK-TYPE COGNITIVE PROFILES
// Each book type has fundamentally different mastery requirements
// ============================================================

interface CognitiveProfile {
  identity: string;
  conceptExtractionFocus: string;
  questionStyle: string;
  bloomWeights: Record<string, number>; // relative weight for distribution
  scoringModifiers: {
    minPassScore: number;
    applyAnalyzeThreshold: number;
    requiresEvalCreate: boolean;
    codingRequired: boolean;
    timeLimitMultiplier: number;
  };
  prohibitedQuestionTypes: string[];
  requiredQuestionTypes: string[];
}

const COGNITIVE_PROFILES: Record<string, CognitiveProfile> = {
  academic: {
    identity: "University Examination Board — Peer-Review Standard",
    conceptExtractionFocus: `
- Identify formal theories, models, and named frameworks with their original authors
- Identify empirical findings and their methodology (sample size, design)
- Identify methodological constraints and validity threats
- Identify competing theoretical perspectives and their key differences
- Identify citation-backed claims vs unsupported assertions`,
    questionStyle: `Academic rigor: questions must mirror university-level exams.
- Require citation awareness (who proposed X, what evidence supports Y)
- Require methodological critique (internal validity, confounds, generalizability)
- Require theoretical integration (how does Theory A relate to Theory B)
- Include at least one question requiring synthesis across multiple theories
- Distractors must reflect actual scholarly debates, not fabricated alternatives`,
    bloomWeights: { remember: 0.5, understand: 1, apply: 1.5, analyze: 2.5, evaluate: 3, create: 2 },
    scoringModifiers: {
      minPassScore: 80,
      applyAnalyzeThreshold: 70,
      requiresEvalCreate: true,
      codingRequired: false,
      timeLimitMultiplier: 1.5,
    },
    prohibitedQuestionTypes: ["opinion-based", "preference"],
    requiredQuestionTypes: ["mechanism-breakdown", "assumption-challenge", "boundary-case"],
  },

  professional: {
    identity: "Executive Assessment — McKinsey Case Interview Standard",
    conceptExtractionFocus: `
- Identify strategic frameworks applied (Porter, SWOT, BCG, PESTLE, McKinsey 7S)
- Identify decision criteria and their weighted importance
- Identify measurable KPIs, ROI calculations, and financial metrics
- Identify risk factors with probability × impact assessments
- Identify implementation constraints (budget, timeline, resources)
- Identify competitive benchmarks and named companies referenced`,
    questionStyle: `Business case rigor: questions must test executive decision-making.
- Present real-world business scenarios with specific financial parameters ($X revenue, Y% margin)
- Require framework application to novel situations
- Require trade-off analysis between competing strategies
- Include at least one question with a decision matrix or resource allocation constraint
- Distractors must represent plausible but suboptimal business strategies
- Questions must have measurable correct answers (not just opinions)`,
    bloomWeights: { remember: 0.3, understand: 0.8, apply: 3, analyze: 2.5, evaluate: 2.5, create: 1.5 },
    scoringModifiers: {
      minPassScore: 75,
      applyAnalyzeThreshold: 75,
      requiresEvalCreate: true,
      codingRequired: false,
      timeLimitMultiplier: 1.3,
    },
    prohibitedQuestionTypes: ["definition-recall", "list-memorization"],
    requiredQuestionTypes: ["trade-off", "constraint", "counterfactual"],
  },

  reference: {
    identity: "Technical Certification Exam — Precise Distinction Standard",
    conceptExtractionFocus: `
- Identify exact definitions with semantic precision (A vs B differences)
- Identify classification taxonomies and category hierarchies
- Identify decision criteria for choosing between similar approaches
- Identify troubleshooting procedures and diagnostic sequences
- Identify version compatibility notes or conditional applicability
- Identify cross-reference dependencies between concepts`,
    questionStyle: `Reference precision: questions must test exact knowledge boundaries.
- Require precise distinction between similar concepts (A vs B vs C)
- Include "when to use X vs Y" decision scenarios with specific conditions
- Require troubleshooting reasoning (given symptom, identify root cause)
- Include at least one taxonomy/classification question
- Distractors must be adjacent concepts that could be confused
- Questions must test the BOUNDARIES of where concepts apply, not just definitions`,
    bloomWeights: { remember: 1.5, understand: 2, apply: 2.5, analyze: 2, evaluate: 1.5, create: 0.5 },
    scoringModifiers: {
      minPassScore: 85,
      applyAnalyzeThreshold: 65,
      requiresEvalCreate: false,
      codingRequired: false,
      timeLimitMultiplier: 1.0,
    },
    prohibitedQuestionTypes: ["opinion-based", "narrative-interpretation"],
    requiredQuestionTypes: ["boundary-case", "trade-off"],
  },

  bestseller: {
    identity: "Thought Leadership Assessment — Applied Wisdom Standard",
    conceptExtractionFocus: `
- Identify named principles, effects, and mental models (e.g., "The Compound Effect")
- Identify real-world case studies and their measurable outcomes
- Identify actionable frameworks and their implementation steps
- Identify belief-disruption moments (counterintuitive insights)
- Identify transformation arcs (before/after scenarios)
- Identify the 1-3 "big ideas" the chapter builds its argument around`,
    questionStyle: `Applied wisdom: questions must test whether the reader can USE the ideas.
- Present novel real-world scenarios where the reader must apply a named principle
- Require predicting outcomes based on the chapter's frameworks
- Include at least one "belief disruption" question (testing whether the reader understands the counterintuitive insight)
- Require distinguishing between similar principles in different contexts
- Distractors must represent common misapplications of the concepts
- Questions should feel like coaching scenarios, not academic exams`,
    bloomWeights: { remember: 0.5, understand: 1.5, apply: 3, analyze: 2, evaluate: 2, create: 1.5 },
    scoringModifiers: {
      minPassScore: 70,
      applyAnalyzeThreshold: 65,
      requiresEvalCreate: false,
      codingRequired: false,
      timeLimitMultiplier: 1.2,
    },
    prohibitedQuestionTypes: ["definition-recall", "list-memorization"],
    requiredQuestionTypes: ["trade-off", "counterfactual", "mechanism-breakdown"],
  },

  children: {
    identity: "Early Learning Assessment — Developmental Psychology Standard",
    conceptExtractionFocus: `
- Identify the moral or life lesson embedded in the story
- Identify character motivations and emotional states
- Identify cause-effect relationships in the narrative
- Identify problem-solving strategies characters used
- Identify social-emotional learning themes (empathy, courage, kindness)
- Identify vocabulary words appropriate for the target age group`,
    questionStyle: `Child-appropriate: questions must match developmental level (ages 6-12).
- Use simple, clear language (max 20 words per question)
- Focus on story comprehension and character understanding
- Include "what would you do?" empathy-building questions
- Include cause-effect reasoning ("Why did X happen?")
- Distractors must be plausible for a child's understanding
- NO abstract theoretical questions — keep everything concrete and story-based
- Use encouraging, supportive framing ("Great thinking!" in explanations)
- Maximum 3 options per question (not 4) for younger audiences`,
    bloomWeights: { remember: 2, understand: 3, apply: 2, analyze: 1.5, evaluate: 1, create: 0.5 },
    scoringModifiers: {
      minPassScore: 60,
      applyAnalyzeThreshold: 50,
      requiresEvalCreate: false,
      codingRequired: false,
      timeLimitMultiplier: 2.0,
    },
    prohibitedQuestionTypes: ["mechanism-breakdown", "assumption-challenge", "boundary-case"],
    requiredQuestionTypes: ["trade-off"],
  },

  comic: {
    identity: "Visual Literacy Assessment — Sequential Art Comprehension",
    conceptExtractionFocus: `
- Identify the narrative arc and plot structure (setup → conflict → resolution)
- Identify character development moments and personality traits
- Identify visual storytelling techniques mentioned or implied
- Identify thematic messages and social commentary
- Identify educational content embedded in the narrative
- Identify world-building elements and their internal consistency`,
    questionStyle: `Visual-narrative literacy: questions must test story AND concept comprehension.
- Reference specific scenes or character moments from the chapter
- Test understanding of narrative causality ("What caused X to happen?")
- Include character motivation analysis ("Why did character choose A over B?")
- Test thematic understanding (the deeper message behind the action)
- If educational content is embedded, test that knowledge directly
- Distractors should reflect surface-level vs deep reading
- Questions should reward attentive reading of both text and visual cues`,
    bloomWeights: { remember: 1, understand: 2.5, apply: 2, analyze: 2.5, evaluate: 1.5, create: 1 },
    scoringModifiers: {
      minPassScore: 65,
      applyAnalyzeThreshold: 55,
      requiresEvalCreate: false,
      codingRequired: false,
      timeLimitMultiplier: 1.5,
    },
    prohibitedQuestionTypes: ["assumption-challenge"],
    requiredQuestionTypes: ["mechanism-breakdown", "counterfactual"],
  },

  workbook: {
    identity: "Skill Verification Assessment — Competency Demonstration Standard",
    conceptExtractionFocus: `
- Identify procedural steps and their correct sequence
- Identify common errors and misconceptions for each skill
- Identify prerequisite knowledge for each exercise
- Identify success criteria and quality benchmarks
- Identify self-assessment checkpoints
- Identify transferable skills across different contexts`,
    questionStyle: `Skill verification: questions must test ability to PERFORM, not just know.
- Present step-by-step scenarios where the reader must identify the correct next action
- Include "spot the error" questions with realistic mistakes
- Require application of procedures to novel situations
- Include at least one question testing transfer (same skill, different context)
- Distractors must represent common procedural errors
- Questions should feel like a practical exam, not a written test
- Include time-pressure elements for procedural fluency`,
    bloomWeights: { remember: 1, understand: 1.5, apply: 3.5, analyze: 1.5, evaluate: 1.5, create: 1 },
    scoringModifiers: {
      minPassScore: 75,
      applyAnalyzeThreshold: 70,
      requiresEvalCreate: false,
      codingRequired: false,
      timeLimitMultiplier: 1.0,
    },
    prohibitedQuestionTypes: ["opinion-based"],
    requiredQuestionTypes: ["constraint", "trade-off"],
  },

  illustrated: {
    identity: "Integrated Comprehension Assessment — Visual-Textual Synthesis",
    conceptExtractionFocus: `
- Identify key concepts that were visually reinforced (referenced by figures)
- Identify relationships between text explanations and their visual representations
- Identify named frameworks, models, and principles with their visual anchors
- Identify data interpretations from charts or diagrams described
- Identify boundary conditions where visual models simplify reality
- Identify cross-concept connections illustrated through visual metaphors`,
    questionStyle: `Visual-textual synthesis: questions must test integrated comprehension.
- Reference how visuals relate to textual concepts ("Based on the framework shown in Figure X...")
- Test interpretation of data visualizations or diagrams described in the text
- Require connecting visual representations to their underlying mechanisms
- Include at least one question testing whether the reader can extend the visual model
- Distractors must include common visual misinterpretations
- Questions should test BOTH the visual insight AND the textual explanation`,
    bloomWeights: { remember: 0.5, understand: 1.5, apply: 2, analyze: 2.5, evaluate: 2, create: 1.5 },
    scoringModifiers: {
      minPassScore: 75,
      applyAnalyzeThreshold: 65,
      requiresEvalCreate: true,
      codingRequired: false,
      timeLimitMultiplier: 1.3,
    },
    prohibitedQuestionTypes: ["list-memorization"],
    requiredQuestionTypes: ["mechanism-breakdown", "trade-off", "boundary-case"],
  },

  // Default/text fallback
  text: {
    identity: "General Comprehension Assessment — Critical Thinking Standard",
    conceptExtractionFocus: `
- Identify named principles, frameworks, effects, and models
- Identify the 3 most intellectually dense mechanisms
- Identify 2 boundary conditions where major ideas weaken or fail
- Identify 2 assumptions the chapter relies on but doesn't defend`,
    questionStyle: `Critical thinking: questions must go beyond surface comprehension.
- Every question must reference at least 2 named constructs
- Must introduce a trade-off, boundary case, constraint, or counterfactual
- No definition questions, no "which is correct?" recall
- Distractors must reflect common misconceptions`,
    bloomWeights: { remember: 0.5, understand: 1, apply: 2, analyze: 2.5, evaluate: 2.5, create: 1.5 },
    scoringModifiers: {
      minPassScore: 75,
      applyAnalyzeThreshold: 65,
      requiresEvalCreate: true,
      codingRequired: false,
      timeLimitMultiplier: 1.2,
    },
    prohibitedQuestionTypes: [],
    requiredQuestionTypes: ["mechanism-breakdown", "trade-off"],
  },
};

// Resolve profile from bookType
function getProfile(bookType: string): CognitiveProfile {
  const normalized = bookType?.toLowerCase().trim() || 'text';
  if (normalized === 'business' || normalized === 'technical') return COGNITIVE_PROFILES.professional;
  return COGNITIVE_PROFILES[normalized] || COGNITIVE_PROFILES.text;
}

// ============================================================
// LAYER 1 — CONCEPT EXTRACTION (PROFILE-DRIVEN)
// ============================================================

const buildConceptExtractionPrompt = (profile: CognitiveProfile) => {
  return `You are a Concept Extraction Engine — ${profile.identity}.

From the chapter below:

1. List 10–20 DISTINCT named constructs (theories, models, laws, effects, mechanisms, frameworks, principles).
2. Identify the 3 most intellectually dense mechanisms (explain WHY they are dense).
3. Identify 2 boundary conditions where a major idea weakens or fails.
4. Identify 2 assumptions the chapter relies on but does not explicitly defend.

TYPE-SPECIFIC EXTRACTION:
${profile.conceptExtractionFocus}

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
// LAYER 3 — BLOOM DISTRIBUTION (PROFILE-DRIVEN)
// ============================================================

function buildBloomDistribution(count: number, primaryLevel: string, profile: CognitiveProfile): string[] {
  const weights = profile.bloomWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  // Build weighted distribution
  const levels = Object.entries(weights)
    .sort(([, a], [, b]) => b - a) // highest weight first
    .map(([level]) => level);

  const distribution: string[] = [];

  // Allocate proportionally to weights
  for (const [level, weight] of Object.entries(weights)) {
    const allocated = Math.round((weight / totalWeight) * count);
    for (let i = 0; i < allocated && distribution.length < count; i++) {
      distribution.push(level);
    }
  }

  // Ensure we always include evaluate if required
  if (profile.scoringModifiers.requiresEvalCreate && !distribution.includes('evaluate')) {
    distribution[distribution.length - 1] = 'evaluate';
  }

  // Pad to requested count with highest-weighted levels
  let padIdx = 0;
  while (distribution.length < count) {
    distribution.push(levels[padIdx % levels.length]);
    padIdx++;
  }

  // Trim to requested count
  return distribution.slice(0, count);
}

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

    const profile = getProfile(bookType);
    const contentSlice = chapterContent.slice(0, 15000);
    log("Starting mastery assessment", { bloomLevel, questionCount, bookType, profile: profile.identity, contentLen: contentSlice.length });

    // ──────────────────────────────────────────────
    // STEP 1: Concept Extraction (profile-driven)
    // ──────────────────────────────────────────────
    log("Step 1: Concept Extraction", { profile: profile.identity });

    const extractionResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: buildConceptExtractionPrompt(profile) },
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
    // STEP 2: Generate Questions with Profile-Driven Bloom Enforcement
    // ──────────────────────────────────────────────
    log("Step 2: Question Generation with Profile-Driven Bloom Enforcement");

    const bloomDistribution = buildBloomDistribution(questionCount, bloomLevel, profile);
    log("Bloom distribution", { distribution: bloomDistribution, profile: profile.identity });

    const isChildren = bookType === 'children';
    const optionCount = isChildren ? 3 : 4;

    const batchPrompt = `Generate exactly ${questionCount} mastery assessment questions for the chapter "${chapterTitle}" from "${bookTitle}".

ASSESSMENT IDENTITY: ${profile.identity}

CHAPTER CONTENT:
${contentSlice.slice(0, 8000)}

EXTRACTED CONCEPTS:
${JSON.stringify(concepts, null, 2)}

TYPE-SPECIFIC QUESTION STYLE:
${profile.questionStyle}

For each question, follow the specific Bloom level enforcement below.

${bloomDistribution.map((bl: string, i: number) => `
QUESTION ${i + 1} — Bloom Level: ${bl.toUpperCase()}
${BLOOM_ENFORCEMENT[bl] || BLOOM_ENFORCEMENT.analyze}
`).join('\n')}

UNIVERSAL RULES:
- Every question must reference at least ${isChildren ? '1' : '2'} named constructs from the extracted list.
- ${isChildren ? 'Use simple, encouraging language appropriate for ages 6-12.' : 'Every question must introduce a trade-off, boundary case, constraint, or counterfactual.'}
- ${isChildren ? 'Maximum 20 words per question. Use 3 options, not 4.' : 'No definition questions. No "which is correct?" No surface recall.'}
- Distractors must ${isChildren ? 'be plausible for a child\'s understanding' : 'reflect common misconceptions, not obviously wrong answers'}.
- Book type: "${bookType}" — ${profile.identity}.

PROHIBITED QUESTION TYPES: ${profile.prohibitedQuestionTypes.join(', ') || 'none'}
REQUIRED QUESTION TYPES (include at least one): ${profile.requiredQuestionTypes.join(', ')}

Each question must have exactly ${optionCount} options.`;

    const genResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You are the ScrollLibrary Mastery Engine v2 — ${profile.identity}. Generate intellectually rigorous assessment questions calibrated to this specific book type.` },
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
    // STEP 3: Question Stress-Test (profile-aware)
    // ──────────────────────────────────────────────
    if (questions.length > 0) {
      log("Step 3: Question Stress-Test", { profile: profile.identity });

      const stressResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: `You are a Question Quality Validator — ${profile.identity}.

Evaluate this assessment question against these criteria:
1. Does it require mechanism-level reasoning? (not just recall)
2. Does it force trade-off evaluation or boundary analysis?
3. Can it be answered by trivial elimination of options?
4. Can it be answered with a single-sentence recall?
5. Are distractors plausible and based on common misconceptions?
6. Does it incorporate named constructs from the domain?

TYPE-SPECIFIC QUALITY CHECKS ("${bookType}"):
${profile.questionStyle}

PROHIBITED PATTERNS: ${profile.prohibitedQuestionTypes.join(', ') || 'none'}

${isChildren ? 'FOR CHILDREN: Evaluate age-appropriateness, clarity, and supportive framing instead of mechanism complexity.' : ''}

If ANY of criteria 1-2 are NO, or if criteria 3-4 are YES, mark as FAIL.
${isChildren ? 'EXCEPTION: For children\'s books, criteria 1-2 are relaxed — focus on age-appropriate reasoning instead.' : ''}

Return JSON:
{
  "pass": true/false,
  "failReasons": ["..."],
  "strengthScore": 1-10
}` },
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
        await stressResp.text();
      }

      if (stressResults?.results) {
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
    // STEP 4: Normalize and compute mastery depth (profile-aware scoring)
    // ──────────────────────────────────────────────
    log("Step 4: Compute mastery depth score", { profile: profile.identity });

    const maxOptions = isChildren ? 3 : 4;

    questions = questions.map((q: any, idx: number) => {
      const bl = q.bloomLevel || bloomDistribution[idx] || "analyze";
      const timeMult = profile.scoringModifiers.timeLimitMultiplier;

      return {
        bloomLevel: bl,
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) && q.options.length >= maxOptions
          ? q.options.slice(0, maxOptions)
          : isChildren ? ["A", "B", "C"] : ["A", "B", "C", "D"],
        correctIndex: typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < maxOptions ? q.correctIndex : 0,
        reasoningExplanation: q.reasoningExplanation || q.explanation || "Correct based on chapter content.",
        bloomJustification: q.bloomJustification || `This question targets the ${bl} level of Bloom's taxonomy.`,
        conceptsUsed: Array.isArray(q.conceptsUsed) ? q.conceptsUsed : [],
        questionType: q.questionType || "mechanism-breakdown",
        difficulty: q.difficulty || 3,
        pointValue: q.pointValue || (bl === "evaluate" ? 7 : bl === "analyze" ? 5 : bl === "apply" ? 3 : 1),
        timeLimit: Math.round((q.timeLimit || 120) * timeMult),
        stressTestPass: q.stressTestPass ?? true,
        strengthScore: q.strengthScore ?? 5,
        stressTestFailReasons: q.stressTestFailReasons || [],
      };
    });

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
      cognitiveProfile: {
        bookType,
        identity: profile.identity,
        minPassScore: profile.scoringModifiers.minPassScore,
        applyAnalyzeThreshold: profile.scoringModifiers.applyAnalyzeThreshold,
        requiresEvalCreate: profile.scoringModifiers.requiresEvalCreate,
      },
    };

    log("Mastery assessment complete", {
      questions: result.questions.length,
      depth: result.masteryDepthScore,
      hasEvalCreate: result.hasEvaluateOrCreate,
      profile: profile.identity,
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
