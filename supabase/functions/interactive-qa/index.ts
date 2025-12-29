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

    const { question, chapterContent, chapterTitle, bookTitle, conversationHistory = [], isQuizMode = false } = await req.json();

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
      isQuizMode
    });

    // Handle Quiz Mode with tool calling for structured output
    if (isQuizMode) {
      logStep("Generating quiz questions using tool calling");

      const quizMessages = [
        {
          role: "system",
          content: `You are a quiz generator for ScrollLibrary. Generate comprehension questions based on chapter content.

CHAPTER CONTEXT:
- Book: "${bookTitle}"
- Chapter: "${chapterTitle}"

CHAPTER CONTENT:
${chapterContent}

Generate exactly 5 multiple-choice questions that test understanding of the key concepts in this chapter. Each question should:
1. Test comprehension, not just memorization
2. Have 4 distinct options with only one correct answer
3. Include a brief explanation for why the correct answer is right
4. Vary in difficulty from basic recall to application`
        },
        {
          role: "user",
          content: "Generate 5 multiple-choice quiz questions for this chapter."
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
                name: "generate_quiz",
                description: "Generate multiple-choice quiz questions based on chapter content",
                parameters: {
                  type: "object",
                  properties: {
                    questions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          question: { 
                            type: "string", 
                            description: "The quiz question text" 
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
                            description: "Brief explanation of why the correct answer is right"
                          }
                        },
                        required: ["question", "options", "correctIndex", "explanation"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["questions"],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "generate_quiz" } }
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
      let questions = [];
      
      if (quizData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        try {
          const args = JSON.parse(quizData.choices[0].message.tool_calls[0].function.arguments);
          questions = args.questions || [];
          logStep("Parsed quiz questions from tool call", { count: questions.length });
        } catch (parseErr) {
          logStep("Failed to parse tool call arguments", { error: String(parseErr) });
        }
      }

      // Fallback: try to parse from content if tool call failed
      if (questions.length === 0 && quizData.choices?.[0]?.message?.content) {
        try {
          const content = quizData.choices[0].message.content;
          // Try to find JSON in the content
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            questions = JSON.parse(jsonMatch[0]);
            logStep("Parsed quiz questions from content fallback", { count: questions.length });
          }
        } catch (parseErr) {
          logStep("Content fallback parse failed", { error: String(parseErr) });
        }
      }

      // Generate fallback questions if all else fails
      if (questions.length === 0) {
        logStep("Using generated fallback questions");
        questions = [
          {
            question: `What is the main topic discussed in the chapter "${chapterTitle}"?`,
            options: [
              "The introduction of key concepts",
              "Historical background information",
              "Practical applications",
              "Theoretical frameworks"
            ],
            correctIndex: 0,
            explanation: "The chapter primarily focuses on introducing and explaining the key concepts central to its theme."
          },
          {
            question: "Which approach does this chapter recommend for understanding the material?",
            options: [
              "Memorization only",
              "Critical analysis and application",
              "Speed reading",
              "Skipping to conclusions"
            ],
            correctIndex: 1,
            explanation: "The chapter emphasizes critical analysis and practical application of concepts for deeper understanding."
          },
          {
            question: "What distinguishes this chapter's perspective from common assumptions?",
            options: [
              "It follows conventional wisdom exactly",
              "It presents a unique or challenging viewpoint",
              "It avoids any conclusions",
              "It only presents statistics"
            ],
            correctIndex: 1,
            explanation: "The chapter offers fresh insights that may challenge or expand upon conventional thinking."
          },
          {
            question: "How does this chapter connect to the broader book themes?",
            options: [
              "It stands completely alone",
              "It builds on previous concepts and leads to future ones",
              "It contradicts other chapters",
              "It repeats earlier material exactly"
            ],
            correctIndex: 1,
            explanation: "Chapters in well-structured books build progressively, connecting to broader themes."
          },
          {
            question: "What is the intended takeaway from this chapter?",
            options: [
              "No clear conclusion",
              "Action steps and deeper understanding",
              "Only historical facts",
              "Entertainment only"
            ],
            correctIndex: 1,
            explanation: "The chapter aims to provide actionable insights and deepen the reader's understanding."
          }
        ];
      }

      // Validate and fix question structure
      questions = questions.map((q: any, idx: number) => ({
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) && q.options.length === 4 
          ? q.options 
          : ["Option A", "Option B", "Option C", "Option D"],
        correctIndex: typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3 
          ? q.correctIndex 
          : 0,
        explanation: q.explanation || "This is the correct answer based on the chapter content."
      }));

      logStep("Quiz generation complete", { questionCount: questions.length });

      return new Response(
        JSON.stringify({
          success: true,
          questions,
          isQuiz: true
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
      // Add conversation history for context
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
