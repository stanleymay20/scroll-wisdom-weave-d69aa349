import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight,
  json,
  serverError,
  requireUser,
  validateBody,
  enforceRateLimit,
  z,
} from "../_shared/http.ts";

const BodySchema = z.object({
  question: z.string().min(1).max(4000),
  answer: z.string().min(1).max(8000),
  chapterTitle: z.string().max(500).optional().default("Unknown"),
  bookTitle: z.string().max(500).optional().default("Unknown"),
});

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    // Each grading call is an AI request — cap to prevent runaway billing.
    const limited = enforceRateLimit({
      name: "grade-think-answer",
      key: auth.userId,
      limit: 30,
      windowSec: 60,
    });
    if (limited) return limited;

    const body = await validateBody(req, BodySchema);
    if (body instanceof Response) return body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return serverError(new Error("LOVABLE_API_KEY not configured"), "ai_misconfigured");
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

Context: Book "${body.bookTitle}", Chapter "${body.chapterTitle}"

Respond ONLY with valid JSON:
{
  "grade": <number 1-5>,
  "feedback": "<1-2 sentence explanation of the grade>",
  "bloomLevel": "<remember|understand|apply|analyze|evaluate|create>"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Question: ${body.question}\n\nStudent's Answer: ${body.answer}` },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (response.status === 402) {
      return json({ error: "AI credits exhausted", code: "credits_exhausted" }, 402);
    }
    if (response.status === 429) {
      return json({ error: "AI provider rate-limited", code: "ai_rate_limited" }, 429);
    }
    if (!response.ok) {
      const errText = await response.text();
      console.error("[grade-think-answer] AI error", { status: response.status, errText });
      return serverError(new Error("AI grading failed"), "ai_failed");
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return serverError(new Error("Failed to parse AI response"), "ai_parse_failed");

    const parsed = JSON.parse(match[0]);
    const grade = Math.max(1, Math.min(5, Math.round(Number(parsed.grade) || 1)));

    return json({
      grade,
      feedback: String(parsed.feedback || "No feedback available"),
      bloomLevel: String(parsed.bloomLevel || "remember"),
    });
  } catch (err) {
    console.error("[grade-think-answer] error", err);
    return serverError(err);
  }
});
