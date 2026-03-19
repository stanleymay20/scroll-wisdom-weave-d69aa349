import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, answer, chapterTitle, bookTitle } = await req.json();

    if (!question || !answer) {
      return new Response(JSON.stringify({ error: "Missing question or answer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are a strict academic grader for ScrollLibrary. Grade the student's answer to a knowledge question.

GRADING SCALE (1-5):
1 = Completely wrong or irrelevant
2 = Shows minimal understanding, major gaps or misconceptions
3 = Partial understanding, some key points but incomplete
4 = Good understanding, covers main concepts with minor gaps
5 = Excellent, comprehensive and accurate answer

RULES:
- Be fair but rigorous
- Grade based on conceptual accuracy, not writing style
- Consider completeness: does the answer cover the key aspects?
- Short answers can still score 5 if they are precise and complete
- Empty or gibberish answers always get 1

Context: Book "${bookTitle || 'Unknown'}", Chapter "${chapterTitle || 'Unknown'}"

Respond ONLY with valid JSON:
{
  "grade": <number 1-5>,
  "feedback": "<1-2 sentence explanation of the grade>",
  "bloomLevel": "<remember|understand|apply|analyze|evaluate|create>"
}`;

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${question}\n\nStudent's Answer: ${answer}` },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[GRADE] AI API error:", errText);
      throw new Error("AI grading failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const result = JSON.parse(jsonMatch[0]);
    const grade = Math.max(1, Math.min(5, Math.round(Number(result.grade) || 1)));

    return new Response(JSON.stringify({
      grade,
      feedback: result.feedback || "No feedback available",
      bloomLevel: result.bloomLevel || "remember",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GRADE] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Grading failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
