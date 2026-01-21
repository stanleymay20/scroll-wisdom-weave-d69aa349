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

CODING QUESTION SUPPORT:
For TECHNICAL content (programming, data science, engineering), include CODING-ENABLED questions:
- Tier 2: "Predict the output of this code:" - show code snippet, ask what it outputs
- Tier 3: "Debug this code:" - show buggy code, ask user to identify/fix the error
- Tier 3: "Complete this function:" - show partial code, ask user to fill in the blank

CODING QUESTION FORMAT (for technical content):
{
  "tier": 3,
  "type": "coding",
  "question": "What is wrong with this function?",
  "codeSnippet": "def add(a, b):\\n    return a + b\\n    print('Result:', a + b)",
  "language": "python",
  "options": ["Missing return statement", "Unreachable code after return", "Wrong operator", "Syntax error"],
  "correctIndex": 1,
  "explanation": "The print statement after return is unreachable code because the function exits at return.",
  "pointValue": 5,
  "timeLimit": 180
}

Generate a multi-tier assessment with this distribution:
- 1-2 Tier 1 (Knowledge Check) questions
- 2 Tier 2 (Applied Reasoning) questions - MANDATORY, include coding for tech content
- 2 Tier 3 (Scenario/Debugging) questions - MANDATORY, include coding for tech content
- 1 Tier 4 (Integrity-Weighted) question if content supports it

Each question must include:
- tier (1-4)
- type: "knowledge", "reasoning", "scenario", "integrity", or "coding" (for code-based questions)
- question text
- codeSnippet (for coding questions - the code to analyze/debug/predict)
- language (for coding questions - python, javascript, java, etc.)
- 4 options for MCQ-style questions OR expected answer approach for open-ended
- correctIndex (0-3) for the correct answer
- explanation of why the answer is correct
- pointValue (Tier 1: 1pt, Tier 2: 3pt, Tier 3: 5pt, Tier 4: 7pt)
- timeLimit in seconds (Tier 1: 30s, Tier 2: 120s, Tier 3: 180s, Tier 4: 60s)

TIER 2 QUESTION FORMATS:
- "What would happen if you [action]?"
- "Given [scenario], predict the output:"
- "Why does [behavior] occur when [condition]?"
- "What does this code output?" (for technical content)

TIER 3 QUESTION FORMATS:
- "The following code/scenario contains an error. Identify and fix it:"
- "Which approach would be most efficient for [scenario]? Justify your choice."
- "Debug this: [problem]. What is wrong?"
- "A junior developer wrote this. Identify improvements:"`;

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

interface QuizQuestion {
  tier: number;
  type: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  pointValue: number;
  timeLimit: number;
  codeSnippet?: string;
  language?: string;
}

function generateFallbackMultiTierQuestions(chapterTitle: string, bookTitle: string, bookType: string): QuizQuestion[] {
  // Check if this is a technical book that should include coding questions
  const isTechnical = /technology|science|programming|computer|data|engineering|software|python|javascript|java|api|database/i.test(bookTitle + chapterTitle + bookType);
  
  const baseQuestions: QuizQuestion[] = [
    // Tier 1 - Knowledge Check (max 2, ~30%)
    {
      tier: 1,
      type: "knowledge",
      question: `What is the main topic discussed in the chapter "${chapterTitle}"?`,
      options: [
        "Historical background and context",
        "The introduction of key concepts and fundamentals",
        "Advanced theoretical frameworks",
        "Practical applications only"
      ],
      correctIndex: 1,
      explanation: "The chapter primarily focuses on introducing and explaining the key concepts central to its theme, building a foundation for deeper understanding.",
      pointValue: 1,
      timeLimit: 30
    },
    // Tier 2 - Applied Reasoning (REQUIRED - 2 questions)
    {
      tier: 2,
      type: "reasoning",
      question: "What would happen if you applied the main concept from this chapter to a real-world scenario?",
      options: [
        "The concept would fail completely in practice",
        "Nothing would change because theory doesn't apply",
        "You would see measurable improvements in understanding and outcomes",
        "Additional unrelated concepts would be needed"
      ],
      correctIndex: 2,
      explanation: "When correctly applied, the concepts in this chapter lead to tangible improvements because the chapter bridges theory with practical application through concrete examples.",
      pointValue: 3,
      timeLimit: 120
    },
    {
      tier: 2,
      type: "reasoning",
      question: "Why does the chapter present information in this particular sequence?",
      options: [
        "Alphabetical organization by topic",
        "Random structure with no pattern",
        "Building from foundational concepts to advanced applications",
        "Most recent research first"
      ],
      correctIndex: 2,
      explanation: "The chapter follows a pedagogical structure, building from foundational concepts to more complex applications. This scaffolding enables progressive understanding.",
      pointValue: 3,
      timeLimit: 120
    },
    // Tier 3 - Scenario & Debugging (REQUIRED - 2 questions)
    {
      tier: 3,
      type: "scenario",
      question: "A learner misunderstands a key concept from this chapter and makes an error in applying it. Based on the chapter content, which misconception is most likely?",
      options: [
        "Applying concepts too literally without contextual adaptation",
        "Skipping foundational steps and jumping to advanced conclusions",
        "Confusing correlation with causation in the subject matter",
        "All of the above are common misconceptions addressed in this chapter"
      ],
      correctIndex: 3,
      explanation: "The chapter addresses multiple common misconceptions. Learners often encounter all of these errors because they represent typical learning barriers in this domain.",
      pointValue: 5,
      timeLimit: 180
    },
    {
      tier: 3,
      type: "scenario",
      question: "Given a scenario where the primary approach fails, which alternative strategy from the chapter should you try first?",
      options: [
        "Abandon the approach entirely and use a different methodology",
        "Apply the troubleshooting and diagnostic techniques mentioned",
        "Ignore the failure and continue with the same approach",
        "Wait for external guidance before taking any action"
      ],
      correctIndex: 1,
      explanation: "The chapter provides systematic troubleshooting techniques. Before abandoning an approach, the diagnostic strategies should be applied to identify root causes.",
      pointValue: 5,
      timeLimit: 180
    },
    // Tier 4 - Integrity-Weighted (for mastery)
    {
      tier: 4,
      type: "integrity",
      question: "In 60 seconds: Synthesize the three most important takeaways from this chapter and explain their interconnection.",
      options: [
        "The concepts are unrelated standalone facts",
        "They form a progressive learning path from theory to practice to mastery",
        "They contradict each other to encourage critical thinking",
        "They are only relevant to specific industries"
      ],
      correctIndex: 1,
      explanation: "The chapter's main concepts are interconnected, forming a coherent framework. Theory provides foundation, practice enables application, and mastery emerges from integration.",
      pointValue: 7,
      timeLimit: 60
    }
  ];

  // Add coding questions for technical content (MANDATORY per ARC-1.0)
  if (isTechnical) {
    // Add Tier 2 coding question - Output Prediction
    baseQuestions.splice(2, 0, {
      tier: 2,
      type: "coding",
      question: "What will this code output?",
      codeSnippet: `def process(items):
    result = []
    for item in items:
        if item > 0:
            result.append(item * 2)
    return result

print(process([1, -2, 3, -4, 5]))`,
      language: "python",
      options: [
        "[2, 6, 10]",
        "[2, -4, 6, -8, 10]",
        "[1, 3, 5]",
        "Error: cannot multiply"
      ],
      correctIndex: 0,
      explanation: "The function filters out negative numbers (keeping 1, 3, 5) and doubles the remaining values: 1*2=2, 3*2=6, 5*2=10. Result: [2, 6, 10]",
      pointValue: 3,
      timeLimit: 120
    });

    // Add Tier 3 coding question - Debug/Fix
    baseQuestions.splice(5, 0, {
      tier: 3,
      type: "coding",
      question: "This function should calculate the average, but it has a bug. What is wrong?",
      codeSnippet: `def calculate_average(numbers):
    total = 0
    for num in numbers:
        total = total + num
    return total / len(numbers)

# Crashes when called with: calculate_average([])`,
      language: "python",
      options: [
        "Should use 'total += num' instead of 'total = total + num'",
        "No check for empty list causes division by zero error",
        "The loop variable should be 'number' not 'num'",
        "return statement should be inside the loop"
      ],
      correctIndex: 1,
      explanation: "When called with an empty list, len(numbers) is 0, causing division by zero. Fix: add 'if not numbers: return 0' at the start.",
      pointValue: 5,
      timeLimit: 180
    });

    // Add another Tier 3 - Trace Execution
    baseQuestions.push({
      tier: 3,
      type: "coding",
      question: "After this code executes, what is the value of 'result'?",
      codeSnippet: `data = {'a': 1, 'b': 2, 'c': 3}
result = sum(v for v in data.values() if v > 1)`,
      language: "python",
      options: [
        "6",
        "5",
        "3",
        "Error: cannot sum dictionary"
      ],
      correctIndex: 1,
      explanation: "data.values() returns [1, 2, 3]. The generator filters v > 1, keeping [2, 3]. sum([2, 3]) = 5.",
      pointValue: 5,
      timeLimit: 180
    });
  }

  // Randomize correct answer positions to avoid anti-pattern
  return baseQuestions.map(q => {
    if (q.options && q.correctIndex !== undefined) {
      // Shuffle options while tracking correct answer
      const correctAnswer = q.options[q.correctIndex];
      const shuffled = [...q.options].sort(() => Math.random() - 0.5);
      const newCorrectIndex = shuffled.indexOf(correctAnswer);
      return { ...q, options: shuffled, correctIndex: newCorrectIndex };
    }
    return q;
  });
}
