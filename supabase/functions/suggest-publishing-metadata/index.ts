import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, badRequest, serverError, unauthorized, requireUser, validateBody, z, enforceRateLimit, serviceClient } from "../_shared/http.ts";

const Body = z.object({ book_id: z.string().uuid() });

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const limited = enforceRateLimit({ name: "suggest-metadata", key: auth.userId, limit: 10, windowSec: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();
    const { data: book, error: bErr } = await sc.from("books")
      .select("id, title, description, category, target_audience, user_id")
      .eq("id", parsed.book_id).maybeSingle();
    if (bErr || !book) return badRequest("Book not found");
    if (book.user_id !== auth.userId) return unauthorized("Not the owner");

    const { data: chapters } = await sc.from("chapters")
      .select("title, content").eq("book_id", parsed.book_id).order("chapter_number").limit(3);

    const sample = (chapters ?? []).map((c) => `## ${c.title}\n${(c.content ?? "").slice(0, 800)}`).join("\n\n");

    const prompt = `You are an Amazon KDP publishing expert. Given the book below, produce JSON ONLY with this schema:
{
  "subtitle": "string (under 100 chars)",
  "amazon_description": "string (HTML-light, 200-400 words, persuasive)",
  "keywords": ["7 SEO/Amazon keywords"],
  "categories": ["2 best-fit Amazon BISAC categories"],
  "backend_keywords": ["7 backend search-only keywords"]
}

Book title: ${book.title}
Category: ${book.category}
Audience: ${book.target_audience ?? "general"}
Description: ${book.description ?? ""}

Sample content:
${sample}

Return STRICT JSON, no markdown fences.`;

    if (!LOVABLE_API_KEY) return serverError(new Error("AI not configured"), "ai_misconfigured");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (r.status === 402) return json({ error: "AI credits exhausted", code: "ai_credits" }, 402);
    if (r.status === 429) return json({ error: "AI rate-limited", code: "ai_rate" }, 429);
    if (!r.ok) return serverError(new Error(`AI ${r.status}`), "ai_failed");
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    let result: any;
    try { result = JSON.parse(cleaned); } catch { return serverError(new Error("AI returned non-JSON"), "ai_parse"); }
    return json({ ok: true, suggestion: result });
  } catch (e) { return serverError(e); }
});
