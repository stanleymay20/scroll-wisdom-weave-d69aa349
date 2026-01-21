import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INTERACTIVE-QA] ${step}${detailsStr}`);
};

// ===========================================
// MULTI-TIER ASSESSMENT SYSTEM
// ===========================================

const TIER_CONFIGS = {
  1: { name: 'Knowledge Check', weight: 0.15, required: false },
  2: { name: 'Applied Reasoning', weight: 0.30, required: true },
  3: { name: 'Scenario & Debugging', weight: 0.35, required: true },
  4: { name: 'Integrity-Weighted', weight: 0.20, required: false }
};

const MULTI_TIER_QUIZ_PROMPT = `You are an assessment generator for ScrollLibrary using a 4-TIER certification system.

TIER SYSTEM (MANDATORY):
- Tier 1: Knowledge Check (MCQ) - Basic recall, minor weight
- Tier 2: Applied Reasoning (REQUIRED for certification) - "What happens if...", output prediction, why/how questions
- Tier 3: Scenario & Debugging (REQUIRED for certification) - Fix broken code, choose best approach, case-based
- Tier 4: Integrity-Weighted (mastery only) - Time-pressured, progressive hints

CRITICAL RULE: MCQ-only quizzes are NOT acceptable for certification.

Generate a multi-tier assessment with this distribution:
- 1-2 Tier 1 (Knowledge Check) questions
- 2 Tier 2 (Applied Reasoning) questions - MANDATORY
- 2 Tier 3 (Scenario/Debugging) questions - MANDATORY  
- 1 Tier 4 (Integrity-Weighted) question if content supports it

Each question must include:
- tier (1-4)
- type: "knowledge", "reasoning", "scenario", "integrity"
- question text
- 4 options for MCQ-style questions OR expected answer approach for open-ended
- correctIndex (0-3) for the correct answer
- explanation of why the answer is correct
- pointValue (Tier 1: 1pt, Tier 2: 3pt, Tier 3: 5pt, Tier 4: 7pt)
- timeLimit in seconds (Tier 1: 30s, Tier 2: 120s, Tier 3: 180s, Tier 4: 60s)

TIER 2 QUESTION FORMATS:
- "What would happen if you [action]?"
- "Given [scenario], predict the output:"
- "Why does [behavior] occur when [condition]?"
- "Compare and contrast [A] and [B]:"

TIER 3 QUESTION FORMATS:
- "The following code/scenario contains an error. Identify and fix it:"
- "Which approach would be most efficient for [scenario]? Justify your choice."
- "Debug this: [problem]. What is wrong?"
- "A junior developer wrote this. Identify improvements:"

TIER 4 QUESTION FORMATS:
- Time-pressured pattern recognition
- Multi-step problem solving
- Progressive hint challenges`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logStep("Auth error", { error: authError?.message });
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("User authenticated", { userId: user.id.slice(0, 8) + "..." });

    const { 
      question, 
      chapterContent, 
      chapterTitle, 
      bookTitle, 
      conversationHistory = [], 
      isQuizMode = false,
      isMasteryMode = false,
      bookType = 'text'
    } = await req.json();

    if (!question || !chapterContent) {
      return new Response(JSON.stringify({ error: "Question and chapter content are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing request", { 
      questionLength: question.length, 
      contentLength: chapterContent.length,
      historyLength: conversationHistory.length,
      isQuizMode,
      isMasteryMode,
      bookType
    });

    // Handle Multi-Tier Quiz Mode
    if (isQuizMode) {
      logStep("Generating MULTI-TIER quiz questions");

      const quizMessages = [
        {
          role: "system",
          content: `${MULTI_TIER_QUIZ_PROMPT}

CHAPTER CONTEXT:
- Book: "${bookTitle}"
- Chapter: "${chapterTitle}"
- Book Type: "${bookType}"
- Mastery Mode: ${isMasteryMode}

CHAPTER CONTENT:
${chapterContent.slice(0, 8000)}

Generate exactly 7 multi-tier quiz questions following the tier distribution above.
${isMasteryMode ? 'Include at least 1 Tier 4 integrity-weighted question.' : 'Tier 4 is optional for non-mastery assessments.'}`
        },
        {
          role: "user",
          content: "Generate 7 multi-tier assessment questions for this chapter following the 4-tier system."
        }
      ];

      const quizResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: quizMessages,
          tools: [
            {
              type: "function",
              function: {
                name: "generate_multi_tier_quiz",
                description: "Generate multi-tier assessment questions based on chapter content",
                parameters: {
                  type: "object",
                  properties: {
                    questions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          tier: { 
                            type: "number", 
                            description: "Assessment tier (1-4)" 
                          },
                          type: { 
                            type: "string", 
                            enum: ["knowledge", "reasoning", "scenario", "integrity"],
                            description: "Question type based on tier" 
                          },
                          question: { 
                            type: "string", 
                            description: "The quiz question text" 
                          },
                          context: {
                            type: "string",
                            description: "Optional context or code snippet for the question"
                          },
                          options: { 
                            type: "array", 
                            items: { type: "string" },
                            description: "Array of 4 answer options"
                          },
                          correctIndex: { 
                            type: "number",
                            description: "Index (0-3) of the correct answer"
                          },
                          explanation: { 
                            type: "string",
                            description: "Detailed explanation of why the correct answer is right"
                          },
                          pointValue: {
                            type: "number",
                            description: "Point value (1 for T1, 3 for T2, 5 for T3, 7 for T4)"
                          },
                          timeLimit: {
                            type: "number",
                            description: "Time limit in seconds"
                          }
                        },
                        required: ["tier", "type", "question", "options", "correctIndex", "explanation", "pointValue", "timeLimit"],
                        additionalProperties: false
                      }
                    },
                    tierBreakdown: {
                      type: "object",
                      properties: {
                        tier1: { type: "number" },
                        tier2: { type: "number" },
                        tier3: { type: "number" },
                        tier4: { type: "number" }
                      }
                    },
                    certificationEligible: {
                      type: "boolean",
                      description: "True if quiz includes required Tier 2 and Tier 3 questions"
                    }
                  },
                  required: ["questions", "tierBreakdown", "certificationEligible"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "generate_multi_tier_quiz" } }
        }),
      });

      if (!quizResponse.ok) {
        const errorText = await quizResponse.text();
        logStep("Quiz generation error", { status: quizResponse.status, error: errorText });
        
        if (quizResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (quizResponse.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`Quiz generation error: ${quizResponse.status}`);
      }

      const quizData = await quizResponse.json();
      logStep("Quiz response received", { hasChoices: !!quizData.choices });

      // Extract questions from tool call response
      let questions: any[] = [];
      let tierBreakdown = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
      let certificationEligible = false;
      
      if (quizData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        try {
          const args = JSON.parse(quizData.choices[0].message.tool_calls[0].function.arguments);
          questions = args.questions || [];
          tierBreakdown = args.tierBreakdown || tierBreakdown;
          certificationEligible = args.certificationEligible || false;
          logStep("Parsed multi-tier quiz questions from tool call", { count: questions.length, tierBreakdown });
        } catch (parseErr) {
          logStep("Failed to parse tool call arguments", { error: String(parseErr) });
        }
      }

      // Fallback: try to parse from content if tool call failed
      if (questions.length === 0 && quizData.choices?.[0]?.message?.content) {
        try {
          const content = quizData.choices[0].message.content;
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            questions = JSON.parse(jsonMatch[0]);
            logStep("Parsed quiz questions from content fallback", { count: questions.length });
          }
        } catch (parseErr) {
          logStep("Content fallback parse failed", { error: String(parseErr) });
        }
      }

      // Generate multi-tier fallback questions if all else fails
      if (questions.length === 0) {
        logStep("Using multi-tier fallback questions");
        questions = generateFallbackMultiTierQuestions(chapterTitle, bookTitle, bookType);
      }

      // Validate and normalize question structure
      questions = questions.map((q: any, idx: number) => ({
        tier: typeof q.tier === 'number' && q.tier >= 1 && q.tier <= 4 ? q.tier : (idx < 2 ? 1 : idx < 4 ? 2 : 3),
        type: q.type || (q.tier === 1 ? 'knowledge' : q.tier === 2 ? 'reasoning' : q.tier === 3 ? 'scenario' : 'integrity'),
        question: q.question || `Question ${idx + 1}`,
        context: q.context || null,
        options: Array.isArray(q.options) && q.options.length === 4 
          ? q.options 
          : ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3 
          ? q.correctIndex 
          : 0,
        explanation: q.explanation || "This is the correct answer based on the chapter content.",
        pointValue: q.pointValue || (q.tier === 1 ? 1 : q.tier === 2 ? 3 : q.tier === 3 ? 5 : 7),
        timeLimit: q.timeLimit || (q.tier === 1 ? 30 : q.tier === 2 ? 120 : q.tier === 3 ? 180 : 60)
      }));

      // Calculate tier breakdown from actual questions
      tierBreakdown = {
        tier1: questions.filter((q: any) => q.tier === 1).length,
        tier2: questions.filter((q: any) => q.tier === 2).length,
        tier3: questions.filter((q: any) => q.tier === 3).length,
        tier4: questions.filter((q: any) => q.tier === 4).length
      };

      // Determine certification eligibility
      certificationEligible = tierBreakdown.tier2 >= 2 && tierBreakdown.tier3 >= 1;
      const masteryEligible = certificationEligible && tierBreakdown.tier4 >= 1;

      // Calculate total points
      const totalPoints = questions.reduce((sum: number, q: any) => sum + q.pointValue, 0);
      const estimatedTime = questions.reduce((sum: number, q: any) => sum + q.timeLimit, 0) / 60; // minutes

      logStep("Multi-tier quiz generation complete", { 
        questionCount: questions.length,
        tierBreakdown,
        certificationEligible,
        masteryEligible,
        totalPoints
      });

      return new Response(
        JSON.stringify({
          success: true,
          questions,
          isQuiz: true,
          isMultiTier: true,
          tierBreakdown,
          certificationEligible,
          masteryEligible,
          totalPoints,
          estimatedTimeMinutes: Math.ceil(estimatedTime)
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Standard Q&A mode
    const messages = [
      {
        role: "system",
        content: `You are a knowledgeable and helpful reading assistant for ScrollLibrary. You help readers understand the content they are reading.

CONTEXT:
- Book: "${bookTitle}"
- Chapter: "${chapterTitle}"
- The user is currently reading this chapter and has questions about it.

YOUR ROLE:
- Answer questions about the chapter content clearly and helpfully
- If the answer isn't directly in the text, provide relevant explanations using your knowledge
- Keep answers concise but thorough (2-4 paragraphs max)
- Use examples when helpful
- If asked to explain something simpler, use analogies and everyday language
- Be encouraging and supportive of the reader's learning journey

CHAPTER CONTENT:
${chapterContent}

IMPORTANT:
- Base your primary answers on the chapter content when possible
- You can supplement with additional knowledge when the chapter doesn't cover something
- Never make up false information
- If you truly don't know something, say so honestly`
      },
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: "user",
        content: question
      }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("AI gateway error", { status: response.status, error: errorText });

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;

    if (!answer) {
      throw new Error("No response generated");
    }

    logStep("Answer generated successfully", { answerLength: answer.length });

    return new Response(
      JSON.stringify({
        success: true,
        answer,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ===========================================
// FALLBACK MULTI-TIER QUESTIONS
// ===========================================

function generateFallbackMultiTierQuestions(chapterTitle: string, bookTitle: string, bookType: string) {
  return [
    // Tier 1 - Knowledge Check
    {
      tier: 1,
      type: "knowledge",
      question: `What is the main topic discussed in the chapter "${chapterTitle}"?`,
      options: [
        "The introduction of key concepts and fundamentals",
        "Historical background and context",
        "Practical applications and use cases",
        "Theoretical frameworks and models"
      ],
      correctIndex: 0,
      explanation: "The chapter primarily focuses on introducing and explaining the key concepts central to its theme.",
      pointValue: 1,
      timeLimit: 30
    },
    {
      tier: 1,
      type: "knowledge",
      question: "Which approach does this chapter recommend for understanding the material?",
      options: [
        "Memorization only",
        "Critical analysis and practical application",
        "Speed reading techniques",
        "Skipping to conclusions"
      ],
      correctIndex: 1,
      explanation: "The chapter emphasizes critical analysis and practical application of concepts for deeper understanding.",
      pointValue: 1,
      timeLimit: 30
    },
    // Tier 2 - Applied Reasoning (REQUIRED)
    {
      tier: 2,
      type: "reasoning",
      question: "What would happen if you applied the main concept from this chapter to a real-world scenario?",
      options: [
        "Nothing would change because theory doesn't apply to practice",
        "You would see measurable improvements in understanding and outcomes",
        "The concept would fail completely in practice",
        "You would need additional concepts not covered in this chapter"
      ],
      correctIndex: 1,
      explanation: "When correctly applied, the concepts in this chapter should lead to tangible improvements, as the chapter bridges theory with practical application.",
      pointValue: 3,
      timeLimit: 120
    },
    {
      tier: 2,
      type: "reasoning",
      question: "Why does the chapter present information in this particular order?",
      options: [
        "Random organization with no specific purpose",
        "Building from foundational concepts to advanced applications",
        "To confuse readers and test their patience",
        "Alphabetical by topic"
      ],
      correctIndex: 1,
      explanation: "The chapter follows a pedagogical structure, building from foundational concepts to more complex applications, enabling progressive understanding.",
      pointValue: 3,
      timeLimit: 120
    },
    // Tier 3 - Scenario & Debugging (REQUIRED)
    {
      tier: 3,
      type: "scenario",
      question: "A colleague misunderstands a key concept from this chapter and makes an error. Based on the chapter content, which misconception is most likely?",
      options: [
        "Confusing correlation with causation in the subject matter",
        "Applying concepts too literally without adaptation",
        "Skipping foundational steps and jumping to conclusions",
        "All of the above are common misconceptions addressed in this chapter"
      ],
      correctIndex: 3,
      explanation: "The chapter addresses multiple common misconceptions, and learners often encounter all of these errors when first engaging with the material.",
      pointValue: 5,
      timeLimit: 180
    },
    {
      tier: 3,
      type: "scenario",
      question: "Given a scenario where the main approach fails, which alternative strategy from the chapter should you try first?",
      options: [
        "Abandon the approach entirely and start over",
        "Apply the troubleshooting techniques mentioned in the chapter",
        "Ignore the failure and continue anyway",
        "Wait for someone else to solve the problem"
      ],
      correctIndex: 1,
      explanation: "The chapter provides troubleshooting techniques and alternative strategies for when the primary approach encounters obstacles.",
      pointValue: 5,
      timeLimit: 180
    },
    // Tier 4 - Integrity-Weighted
    {
      tier: 4,
      type: "integrity",
      question: "In 60 seconds: Synthesize the three most important takeaways from this chapter and explain how they connect to form a coherent understanding.",
      options: [
        "The concepts are unrelated and stand alone",
        "They form a progressive learning path from theory to practice",
        "They contradict each other intentionally",
        "They are only relevant to specific industries"
      ],
      correctIndex: 1,
      explanation: "The chapter's main concepts are interconnected, forming a progressive learning path that builds from theoretical foundations to practical applications.",
      pointValue: 7,
      timeLimit: 60
    }
  ];
}
