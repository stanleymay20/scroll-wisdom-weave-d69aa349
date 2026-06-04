// Creator Intelligence — turns business metrics into 5–8 actionable recommendations.
// Uses Lovable AI Gateway (gemini-2.5-flash). No user secrets required.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ error: "missing_auth" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const windowDays = 30;
    const [rev, aud, sales, pub] = await Promise.all([
      supabase.rpc("get_creator_revenue_summary", { _user_id: user.id, _window_days: windowDays }),
      supabase.rpc("get_creator_audience_summary", { _user_id: user.id, _window_days: windowDays }),
      supabase.rpc("get_creator_sales_conversion", { _user_id: user.id, _window_days: windowDays }),
      supabase.rpc("get_creator_publishing_analytics", { _user_id: user.id, _window_days: windowDays }),
    ]);

    const metrics = {
      revenue: rev.data ?? null,
      audience: aud.data ?? null,
      sales: sales.data ?? null,
      publishing: pub.data ?? null,
    };

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "ai_unavailable" }, 503);

    const prompt = `You are a senior creator-economy strategist advising a knowledge creator on ScrollLibrary (a platform to generate, publish, and monetize books, courses, and certifications).

Below are this creator's last-${windowDays}-day metrics in JSON. Produce 5 to 8 concise, specific, actionable recommendations. Each recommendation must reference the metric(s) it derives from. Avoid generic advice.

Categories to cover when relevant: pricing, topics/content gaps, promotion, audience growth, upsells/bundles, channel mix, conversion fixes.

Return STRICT JSON only, matching this schema:
{
  "recommendations": [
    {
      "category": "pricing | topic | promotion | audience | upsell | channel | conversion",
      "title": "short imperative title (max 80 chars)",
      "rationale": "1-2 sentences citing specific numbers from the metrics",
      "priority": "high | medium | low",
      "expected_impact": "short phrase, e.g. '+15% checkout conversion'"
    }
  ]
}

METRICS:
${JSON.stringify(metrics, null, 2)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You output only valid JSON. No prose. No code fences." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 402) return json({ error: "ai_credits_exhausted", recommendations: [] }, 402);
    if (aiRes.status === 429) return json({ error: "ai_rate_limited", recommendations: [] }, 429);
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: "ai_failed", detail: txt.slice(0, 300), recommendations: [] }, 502);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { recommendations: [] }; }

    return json({
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 8) : [],
      generated_at: new Date().toISOString(),
      metrics_window_days: windowDays,
    });
  } catch (e) {
    return json({ error: "internal_error", detail: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
