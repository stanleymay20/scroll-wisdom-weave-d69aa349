import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) => {
  console.log(`[MASTERY-ENGINE-V2] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// ============================================================
// BOOK-TYPE COGNITIVE PROFILES
// ============================================================

interface CognitiveProfile {
  identity: string;
  conceptExtractionFocus: string;
  questionStyle: string;
  bloomWeights: Record<string, number>;
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
- Include at least one "belief disruption" question
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
- Reference how visuals relate to textual concepts
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
5. For each named construct, identify 2-3 SEMANTICALLY RELATED concepts that could serve as plausible distractors (concepts that are close enough to confuse a surface-level learner but clearly distinct under scrutiny).

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
// QUESTION FORMAT TYPES — Diversification Engine
// ============================================================

const QUESTION_FORMATS = [
  'definition',
  'scenario_application',
  'comparison',
  'error_detection',
  'reverse_reasoning',
] as const;

type QuestionFormat = typeof QUESTION_FORMATS[number];

const QUESTION_FORMAT_INSTRUCTIONS: Record<QuestionFormat, string> = {
  definition: `DEFINITION FORMAT: Ask what a concept means or how it is characterized. Use only for Remember/Understand levels. Frame as recognition, not verbatim recall.`,

  scenario_application: `SCENARIO APPLICATION FORMAT (DEFAULT for Apply/Analyze/Evaluate):
Present a SHORT real-world scenario (2-3 sentences) describing a specific situation with concrete details.
Then ask which concept, principle, or approach applies.

EXAMPLE PATTERN:
"A marketing team notices that their A/B test shows a 2% improvement but the sample size is only 50 users per group. They declare the new design a winner. Which statistical principle does this violate?"

The scenario MUST be novel — not copied from the chapter. It must require TRANSFER of understanding.`,

  comparison: `COMPARISON FORMAT: Present two or more related concepts and ask the learner to distinguish them, identify when each applies, or explain why one is preferred over another in a given context.

EXAMPLE PATTERN:
"Both [Concept A] and [Concept B] address [problem domain]. Under what conditions would [Concept A] be preferred, and why does [Concept B] fail in that context?"`,

  error_detection: `ERROR DETECTION FORMAT: Present a statement, argument, or scenario that contains a SPECIFIC logical flaw, misconception, or misapplication of a concept from the chapter. Ask the learner to identify what is wrong.

EXAMPLE PATTERN:
"A colleague argues: '[flawed reasoning that sounds plausible].' Which error in reasoning is present?"

The flaw must be subtle enough that someone who only memorized definitions would miss it.`,

  reverse_reasoning: `REVERSE REASONING FORMAT: Present an outcome, result, or conclusion FIRST, then ask the learner to work backwards to identify which concept, mechanism, or cause explains it.

EXAMPLE PATTERN:
"A system exhibits [specific observable behavior]. Based on the chapter content, which underlying mechanism most likely causes this?"

This format catches memorizers because it requires understanding the causal chain, not just the definition.`,
};

// ============================================================
// QUESTION ENTROPY & DIVERSITY RULES
// ============================================================

const ENTROPY_RULES = {
  maxDefinitionPercent: 0.30,
  minScenarioPercent: 0.40,
  minComparisonOrReasoning: 1, // per concept cluster
  maxSameFormatConsecutive: 2,
};

function assignQuestionFormats(count: number, bloomLevels: string[], isChildren: boolean): QuestionFormat[] {
  if (isChildren) {
    // Children: simpler format distribution
    return bloomLevels.map(bl => {
      if (bl === 'remember') return 'definition';
      if (bl === 'understand') return Math.random() > 0.5 ? 'definition' : 'comparison';
      return 'scenario_application';
    });
  }

  const formats: QuestionFormat[] = [];
  const maxDef = Math.floor(count * ENTROPY_RULES.maxDefinitionPercent);
  const minScenario = Math.ceil(count * ENTROPY_RULES.minScenarioPercent);
  let defCount = 0;
  let scenarioCount = 0;

  // Higher Bloom levels MUST use scenario/comparison/error/reverse
  const higherBloomFormats: QuestionFormat[] = ['scenario_application', 'comparison', 'error_detection', 'reverse_reasoning'];

  for (let i = 0; i < count; i++) {
    const bl = bloomLevels[i] || 'analyze';

    if (bl === 'remember' && defCount < maxDef) {
      formats.push('definition');
      defCount++;
    } else if (bl === 'understand' && defCount < maxDef && Math.random() < 0.3) {
      formats.push('definition');
      defCount++;
    } else if (['apply', 'analyze', 'evaluate', 'create'].includes(bl)) {
      // Force scenario-based for higher Bloom unless we already have enough
      if (scenarioCount < minScenario) {
        formats.push('scenario_application');
        scenarioCount++;
      } else {
        const fmt = higherBloomFormats[Math.floor(Math.random() * higherBloomFormats.length)];
        formats.push(fmt);
        if (fmt === 'scenario_application') scenarioCount++;
      }
    } else {
      // understand level: mix comparison and scenario
      const fmt = Math.random() < 0.5 ? 'comparison' : 'scenario_application';
      formats.push(fmt);
      if (fmt === 'scenario_application') scenarioCount++;
    }
  }

  // Enforce minimum scenario count
  while (scenarioCount < minScenario) {
    const defIdx = formats.findIndex(f => f === 'definition');
    if (defIdx >= 0) {
      formats[defIdx] = 'scenario_application';
      scenarioCount++;
      defCount--;
    } else break;
  }

  // Ensure at least one comparison or reverse_reasoning
  if (!formats.includes('comparison') && !formats.includes('reverse_reasoning') && !formats.includes('error_detection')) {
    // Replace the last scenario with a comparison
    const lastScenario = formats.lastIndexOf('scenario_application');
    if (lastScenario >= 0 && scenarioCount > minScenario) {
      formats[lastScenario] = Math.random() > 0.5 ? 'comparison' : 'error_detection';
    }
  }

  return formats;
}

// ============================================================
// LAYER 3 — BLOOM DISTRIBUTION (PROFILE-DRIVEN)
// ============================================================

function buildBloomDistribution(count: number, primaryLevel: string, profile: CognitiveProfile): string[] {
  const weights = profile.bloomWeights;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const distribution: string[] = [];

  for (const [level, weight] of Object.entries(weights)) {
    const allocated = Math.round((weight / totalWeight) * count);
    for (let i = 0; i < allocated && distribution.length < count; i++) {
      distribution.push(level);
    }
  }

  if (profile.scoringModifiers.requiresEvalCreate && !distribution.includes('evaluate')) {
    distribution[distribution.length - 1] = 'evaluate';
  }

  let padIdx = 0;
  const levels = Object.entries(weights)
    .sort(([, a], [, b]) => b - a)
    .map(([level]) => level);

  while (distribution.length < count) {
    distribution.push(levels[padIdx % levels.length]);
    padIdx++;
  }

  // Fisher-Yates shuffle the distribution so bloom levels aren't in predictable order
  for (let i = distribution.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
  }

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
      previousQuestionTexts = [],
      learnerScore,
    } = await req.json();

    if (!chapterContent) {
      return new Response(JSON.stringify({ error: "chapterContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = getProfile(bookType);
    const contentSlice = chapterContent.slice(0, 15000);
    const isChildren = bookType === 'children';
    const optionCount = isChildren ? 3 : 4;

    log("Starting mastery assessment", { bloomLevel, questionCount, bookType, profile: profile.identity, contentLen: contentSlice.length });

    // ──────────────────────────────────────────────
    // Adaptive difficulty based on learner score
    // ──────────────────────────────────────────────
    let difficultyDirective = '';
    if (typeof learnerScore === 'number') {
      if (learnerScore > 80) {
        difficultyDirective = `ADAPTIVE DIFFICULTY: HARD MODE. The learner scored ${learnerScore}%. Generate questions that target edge cases, boundary conditions, multi-step reasoning, and adversarial scenarios. Focus on Analyze/Evaluate/Create levels. Include at least one question designed to catch shallow memorization.`;
      } else if (learnerScore >= 50) {
        difficultyDirective = `ADAPTIVE DIFFICULTY: MIXED MODE. The learner scored ${learnerScore}%. Generate a balanced mix: some reinforcement questions at Apply level and some challenging questions at Analyze/Evaluate. Gradually increase complexity.`;
      } else {
        difficultyDirective = `ADAPTIVE DIFFICULTY: REINFORCEMENT MODE. The learner scored ${learnerScore}%. Generate questions that reinforce core concepts with simpler scenarios. Focus on Understand/Apply levels. Use concrete, familiar contexts. Build confidence before escalating.`;
      }
    }

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
            description: "Extract named constructs, mechanisms, boundary conditions, assumptions, and distractor concepts.",
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
                },
                conceptGraph: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      concept: { type: "string" },
                      relatedConcepts: {
                        type: "array",
                        items: { type: "string" },
                        description: "2-3 semantically related concepts that could serve as plausible distractors"
                      }
                    },
                    required: ["concept", "relatedConcepts"],
                    additionalProperties: false
                  },
                  description: "Concept graph mapping each construct to semantically related distractors"
                }
              },
              required: ["namedConstructs", "denseMechanisms", "boundaryConditions", "implicitAssumptions", "conceptGraph"],
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
      conceptGraph: [],
    };

    if (extractionResp.ok) {
      const extractData = await extractionResp.json();
      try {
        const args = extractData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (args) concepts = JSON.parse(args);
        log("Concepts extracted", {
          constructs: concepts.namedConstructs?.length || 0,
          mechanisms: concepts.denseMechanisms?.length || 0,
          graphSize: concepts.conceptGraph?.length || 0,
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
    // STEP 2: Generate Questions with Diversification Engine
    // ──────────────────────────────────────────────
    log("Step 2: Question Generation with Diversification Engine");

    const bloomDistribution = buildBloomDistribution(questionCount, bloomLevel, profile);
    const questionFormats = assignQuestionFormats(questionCount, bloomDistribution, isChildren);
    log("Bloom distribution", { distribution: bloomDistribution, formats: questionFormats, profile: profile.identity });

    // Build distractor pool from concept graph
    const distractorPool = (concepts.conceptGraph || [])
      .map((c: any) => `${c.concept} → related: ${(c.relatedConcepts || []).join(', ')}`)
      .join('\n');

    // Session dedup directive
    const dedupDirective = previousQuestionTexts.length > 0
      ? `\n\nSESSION DEDUP — FORBIDDEN QUESTIONS (do NOT repeat or paraphrase):\n${previousQuestionTexts.slice(-20).map((t: string, i: number) => `${i + 1}. "${t}"`).join('\n')}\n\nEvery question you generate MUST be structurally different from the above. Vary wording, scenario context, and reasoning depth.`
      : '';

    const batchPrompt = `Generate exactly ${questionCount} mastery assessment questions for the chapter "${chapterTitle}" from "${bookTitle}".

ASSESSMENT IDENTITY: ${profile.identity}

CHAPTER CONTENT:
${contentSlice.slice(0, 8000)}

EXTRACTED CONCEPTS:
${JSON.stringify(concepts.namedConstructs || [], null, 2)}

DENSE MECHANISMS:
${JSON.stringify(concepts.denseMechanisms || [], null, 2)}

BOUNDARY CONDITIONS:
${JSON.stringify(concepts.boundaryConditions || [], null, 2)}

DISTRACTOR CONCEPT GRAPH (use these related concepts as wrong-answer sources):
${distractorPool || 'Not available — generate plausible distractors from chapter content.'}

TYPE-SPECIFIC QUESTION STYLE:
${profile.questionStyle}

${difficultyDirective}

QUESTION FORMAT DIVERSIFICATION (MANDATORY):
Each question MUST follow its assigned format. Do NOT default to definition-style questions.

${bloomDistribution.map((bl: string, i: number) => `
QUESTION ${i + 1} — Bloom Level: ${bl.toUpperCase()} | Format: ${questionFormats[i].toUpperCase()}
${BLOOM_ENFORCEMENT[bl] || BLOOM_ENFORCEMENT.analyze}
${QUESTION_FORMAT_INSTRUCTIONS[questionFormats[i]]}
`).join('\n')}

DISTRACTOR ENGINEERING (CRITICAL):
- Wrong answers MUST come from semantically related concepts in the distractor graph above.
- Each wrong answer must be a PLAUSIBLE misapplication, a related-but-incorrect concept, or a common misconception.
- NEVER use obviously incorrect fillers (e.g., "None of the above", random unrelated terms).
- All ${optionCount} options must be similar in length, specificity, and linguistic style.
- Only ONE option may be clearly correct. The others must require genuine reasoning to eliminate.

QUESTION MUTATION CONTRACT:
- Each question must use a DIFFERENT scenario, context, or framing — even if testing the same concept.
- Vary: sentence structure, scenario domain (workplace, research, everyday life), and reasoning chain.
- For the same concept, generate questions that approach it from completely different angles.
${dedupDirective}

ANTI-PREDICTABILITY CONTRACT (CRITICAL — HARD ENFORCEMENT):
1. RANDOMIZE correctIndex: Distribute correct answers EVENLY across positions 0-${optionCount - 1}. No single position should hold more than ${Math.ceil(questionCount / optionCount)} correct answers.
2. EQUAL-LENGTH OPTIONS: All ${optionCount} options MUST be similar in length (within 20% word count).
3. PLAUSIBLE DISTRACTORS: Every wrong option must represent a real misconception from the concept graph.
4. STYLE CONSISTENCY: If one option uses technical language, ALL must.
5. NO HEDGING BIAS: Do NOT make the correct answer the only one with "may", "sometimes", etc.
6. NO GIVEAWAYS: No "all of the above", "none of the above", or joke answers.

ADVERSARIAL QUESTIONS (include at least 1):
Generate at least one question specifically designed to catch someone who MEMORIZED the definition but does NOT understand the concept. This question should:
- Present a scenario where the definition seems to apply but actually doesn't (boundary case)
- OR present two concepts whose definitions overlap but whose applications differ
- OR require the learner to predict what happens when conditions change

UNIVERSAL RULES:
- Every question must reference at least ${isChildren ? '1' : '2'} named constructs.
- ${isChildren ? 'Use simple, encouraging language for ages 6-12.' : 'No definition questions unless format explicitly says definition. No surface recall.'}
- Book type: "${bookType}" — ${profile.identity}.
- PROHIBITED: ${profile.prohibitedQuestionTypes.join(', ') || 'none'}
- REQUIRED (include at least one): ${profile.requiredQuestionTypes.join(', ')}

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
          { role: "system", content: `You are the ScrollLibrary Mastery Engine v3 — ${profile.identity}. Generate intellectually rigorous, format-diversified assessment questions. Every question must follow its assigned format and use distractors from the concept graph.` },
          { role: "user", content: batchPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_mastery_questions",
            description: "Generate mastery assessment questions with Bloom enforcement and format diversification",
            parameters: {
              type: "object",
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      bloomLevel: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"] },
                      questionFormat: { type: "string", enum: ["definition", "scenario_application", "comparison", "error_detection", "reverse_reasoning"] },
                      question: { type: "string" },
                      scenario: { type: "string", description: "The scenario context (for scenario/error/reverse formats). Empty for definition questions." },
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: "number" },
                      reasoningExplanation: { type: "string", description: "Detailed mechanism-level explanation of why the answer is correct" },
                      bloomJustification: { type: "string", description: "Why this question qualifies for its Bloom level" },
                      conceptsUsed: { type: "array", items: { type: "string" }, description: "Named constructs referenced" },
                      distractorSources: { type: "array", items: { type: "string" }, description: "Which related concepts the wrong answers come from" },
                      questionType: { type: "string", enum: ["trade-off", "boundary-case", "constraint", "counterfactual", "mechanism-breakdown", "assumption-challenge", "error-identification", "reverse-inference"] },
                      isAdversarial: { type: "boolean", description: "True if this question is designed to catch memorizers" },
                      difficulty: { type: "number", description: "1-6 difficulty scale" },
                      pointValue: { type: "number" },
                      timeLimit: { type: "number" }
                    },
                    required: ["bloomLevel", "questionFormat", "question", "options", "correctIndex", "reasoningExplanation", "bloomJustification", "conceptsUsed", "distractorSources", "questionType", "isAdversarial", "difficulty", "pointValue", "timeLimit"],
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

Evaluate each assessment question against these criteria:
1. Does it require mechanism-level reasoning? (not just recall)
2. Does it force trade-off evaluation or boundary analysis?
3. Can it be answered by trivial elimination of options?
4. Can it be answered with a single-sentence recall?
5. Are distractors plausible and based on common misconceptions?
6. Does it incorporate named constructs from the domain?
7. Does it follow its assigned question format correctly?
8. Would a memorizer (someone who memorized definitions but doesn't understand) get it right?

TYPE-SPECIFIC QUALITY CHECKS ("${bookType}"):
${profile.questionStyle}

PROHIBITED PATTERNS: ${profile.prohibitedQuestionTypes.join(', ') || 'none'}

${isChildren ? 'FOR CHILDREN: Evaluate age-appropriateness and supportive framing instead of mechanism complexity.' : ''}

FAIL CONDITIONS:
- Criteria 1-2 are NO (unless children's book)
- Criteria 3-4 are YES
- Criterion 8 is YES (memorizer would pass)
- Format doesn't match assignment

Return JSON.` },
            { role: "user", content: `Evaluate these ${questions.length} questions:\n${JSON.stringify(questions.map((q: any, i: number) => ({
              index: i,
              bloomLevel: q.bloomLevel,
              questionFormat: q.questionFormat,
              question: q.question,
              options: q.options,
              isAdversarial: q.isAdversarial,
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
                        failReasons: { type: "array", items: { type: "string" } },
                        memorizeResistant: { type: "boolean", description: "True if a memorizer would likely fail this question" }
                      },
                      required: ["index", "pass", "strengthScore", "memorizeResistant"],
                      additionalProperties: false
                    }
                  },
                  overallDepthScore: { type: "number", description: "Average depth score 1-10" },
                  formatDiversityScore: { type: "number", description: "How diverse the question formats are, 1-10" }
                },
                required: ["results", "overallDepthScore", "formatDiversityScore"],
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
            questions[result.index].memorizeResistant = result.memorizeResistant ?? true;
          }
        }

        const passCount = stressResults.results.filter((r: any) => r.pass).length;
        log("Stress-test complete", {
          passed: passCount,
          total: stressResults.results.length,
          overallDepth: stressResults.overallDepthScore,
          formatDiversity: stressResults.formatDiversityScore,
        });
      }
    }

    // ──────────────────────────────────────────────
    // STEP 4: Normalize, shuffle, compute entropy
    // ──────────────────────────────────────────────
    log("Step 4: Normalize, shuffle, compute entropy", { profile: profile.identity });

    const maxOptions = isChildren ? 3 : 4;

    // Fisher-Yates shuffle for answer randomization
    function shuffleWithTracking(options: string[], correctIdx: number): { options: string[]; correctIndex: number } {
      const indexed = options.map((opt, i) => ({ text: opt, wasCorrect: i === correctIdx }));
      for (let i = indexed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
      }
      return {
        options: indexed.map(o => o.text),
        correctIndex: indexed.findIndex(o => o.wasCorrect),
      };
    }

    const positionCounts: Record<number, number> = {};

    questions = questions.map((q: any, idx: number) => {
      const bl = q.bloomLevel || bloomDistribution[idx] || "analyze";
      const timeMult = profile.scoringModifiers.timeLimitMultiplier;
      const fmt = q.questionFormat || questionFormats[idx] || 'scenario_application';

      let options = Array.isArray(q.options) && q.options.length >= maxOptions
        ? q.options.slice(0, maxOptions)
        : isChildren ? ["A", "B", "C"] : ["A", "B", "C", "D"];
      let correctIndex = typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < maxOptions ? q.correctIndex : 0;

      // ALWAYS shuffle options server-side
      const shuffled = shuffleWithTracking(options, correctIndex);
      options = shuffled.options;
      correctIndex = shuffled.correctIndex;

      positionCounts[correctIndex] = (positionCounts[correctIndex] || 0) + 1;

      return {
        bloomLevel: bl,
        questionFormat: fmt,
        question: q.question || `Question ${idx + 1}`,
        scenario: q.scenario || null,
        options,
        correctIndex,
        reasoningExplanation: q.reasoningExplanation || q.explanation || "Correct based on chapter content.",
        bloomJustification: q.bloomJustification || `This question targets the ${bl} level of Bloom's taxonomy.`,
        conceptsUsed: Array.isArray(q.conceptsUsed) ? q.conceptsUsed : [],
        distractorSources: Array.isArray(q.distractorSources) ? q.distractorSources : [],
        questionType: q.questionType || "mechanism-breakdown",
        isAdversarial: q.isAdversarial || false,
        difficulty: q.difficulty || 3,
        pointValue: q.pointValue || (bl === "evaluate" ? 7 : bl === "analyze" ? 5 : bl === "apply" ? 3 : 1),
        timeLimit: Math.round((q.timeLimit || 120) * timeMult),
        stressTestPass: q.stressTestPass ?? true,
        strengthScore: q.strengthScore ?? 5,
        stressTestFailReasons: q.stressTestFailReasons || [],
        memorizeResistant: q.memorizeResistant ?? true,
      };
    });

    // Shuffle question ORDER (so concept sequence is unpredictable)
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    log("Answer position distribution", positionCounts);

    // ──────────────────────────────────────────────
    // STEP 5: Entropy validation
    // ──────────────────────────────────────────────
    const formatCounts: Record<string, number> = {};
    for (const q of questions) {
      formatCounts[q.questionFormat] = (formatCounts[q.questionFormat] || 0) + 1;
    }
    const defPercent = (formatCounts['definition'] || 0) / Math.max(questions.length, 1);
    const scenarioPercent = (formatCounts['scenario_application'] || 0) / Math.max(questions.length, 1);
    const hasComparisonOrReasoning = (formatCounts['comparison'] || 0) + (formatCounts['error_detection'] || 0) + (formatCounts['reverse_reasoning'] || 0) > 0;
    const adversarialCount = questions.filter((q: any) => q.isAdversarial).length;

    const entropyReport = {
      formatDistribution: formatCounts,
      definitionPercent: Math.round(defPercent * 100),
      scenarioPercent: Math.round(scenarioPercent * 100),
      hasComparisonOrReasoning,
      adversarialCount,
      passesEntropyCheck: defPercent <= ENTROPY_RULES.maxDefinitionPercent && scenarioPercent >= ENTROPY_RULES.minScenarioPercent && hasComparisonOrReasoning,
    };

    log("Entropy report", entropyReport);

    // Compute mastery depth score
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
      entropyReport,
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
      entropy: entropyReport.passesEntropyCheck,
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
