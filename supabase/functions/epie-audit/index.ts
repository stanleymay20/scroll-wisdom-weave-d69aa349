/**
 * EPIE Audit — Foundation stub
 * Runs a multi-layer publishing audit on a book and persists a scorecard.
 * Real per-layer logic lands in subsequent phases; this scaffold creates the
 * audit row, computes a heuristic score, and returns the structured result.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function tier(avg: number) {
  if (avg >= 95) return "sovereign";
  if (avg >= 88) return "platinum";
  if (avg >= 80) return "gold";
  if (avg >= 70) return "silver";
  return "bronze";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const bookId = body?.bookId;
    if (!bookId) {
      return new Response(JSON.stringify({ error: "bookId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull chapters for heuristic analysis (foundation pass — text stats only)
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, content, word_count, is_generated")
      .eq("book_id", bookId);

    const generated = (chapters ?? []).filter((c) => c.is_generated && c.content);
    const totalWords = generated.reduce((s, c) => s + (c.word_count ?? 0), 0);
    const avgChapterWords = generated.length ? totalWords / generated.length : 0;

    // Heuristic scorecard (placeholder; real layer logic lands in phase 2+)
    const scores = {
      publish_readiness: generated.length > 0 ? Math.min(100, 40 + generated.length * 5) : 0,
      human_authenticity: avgChapterWords > 800 ? 70 : 55,
      engagement: 65,
      strategic_depth: avgChapterWords > 1200 ? 75 : 60,
      commercial: 60,
      citation_confidence: 50,
      formatting: 70,
    };
    const avg = Object.values(scores).reduce((s, v) => s + v, 0) / 7;

    const findings = [
      {
        layer: "content_intelligence",
        severity: "low",
        code: "EPIE_FOUNDATION",
        message: "EPIE foundation scaffold active. Per-layer deep analysis will populate findings in subsequent phases.",
      },
    ];

    const { data: audit, error: insErr } = await supabase
      .from("publishing_audits")
      .insert({
        book_id: bookId,
        user_id: user.id,
        status: "completed",
        layer: "all",
        certification_tier: tier(avg),
        publish_readiness_score: scores.publish_readiness,
        human_authenticity_score: scores.human_authenticity,
        engagement_score: scores.engagement,
        strategic_depth_score: scores.strategic_depth,
        commercial_score: scores.commercial,
        citation_confidence_score: scores.citation_confidence,
        formatting_score: scores.formatting,
        findings,
        metadata: { chapters_analyzed: generated.length, total_words: totalWords },
      })
      .select()
      .single();

    if (insErr) throw insErr;

    await supabase.from("publishing_readiness_snapshots").insert({
      book_id: bookId,
      user_id: user.id,
      audit_id: audit.id,
      scores,
      certification_tier: tier(avg),
    });

    return new Response(JSON.stringify({ audit, scores, tier: tier(avg) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("epie-audit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
