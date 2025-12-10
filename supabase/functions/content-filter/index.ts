import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Harmful content patterns (basic implementation - production would use ML)
const harmfulPatterns = {
  hate_speech: [
    /\b(hate|kill|murder)\s+(all\s+)?(jews|muslims|christians|blacks|whites|gays|women|men)\b/gi,
    /\b(racial|ethnic)\s+cleansing\b/gi,
    /\bnazi\s+(propaganda|ideology)\b/gi,
  ],
  explicit: [
    /\b(pornographic|sexually\s+explicit)\s+content\b/gi,
    /\bchild\s+(porn|exploitation|abuse)\b/gi,
  ],
  violence: [
    /\b(instructions|how)\s+to\s+(kill|murder|harm)\b/gi,
    /\b(bomb|weapon)\s+making\s+(instructions|guide)\b/gi,
    /\bterrorism\s+(guide|manual)\b/gi,
  ],
  illegal: [
    /\b(drug)\s+(manufacturing|production)\s+(guide|instructions)\b/gi,
    /\bhacking\s+(into|attack)\s+(bank|government)\b/gi,
  ],
};

// Content categories requiring disclaimers
const disclaimerCategories = {
  medical: [/\b(diagnosis|treatment|medication|prescription|surgery|disease|illness)\b/gi],
  legal: [/\b(legal\s+advice|lawsuit|litigation|court|attorney|lawyer)\b/gi],
  financial: [/\b(investment\s+advice|trading\s+strategy|stock\s+picks|guaranteed\s+returns)\b/gi],
};

interface ContentFilterResult {
  approved: boolean;
  flagged: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
  disclaimersNeeded: string[];
  autoReject: boolean;
}

function analyzeContent(text: string, title: string = ""): ContentFilterResult {
  const combinedText = `${title} ${text}`.toLowerCase();
  const result: ContentFilterResult = {
    approved: true,
    flagged: false,
    severity: "low",
    reasons: [],
    disclaimersNeeded: [],
    autoReject: false,
  };

  // Check for harmful content
  for (const [category, patterns] of Object.entries(harmfulPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(combinedText)) {
        result.flagged = true;
        result.reasons.push(category);
        
        if (category === "hate_speech" || category === "explicit") {
          result.severity = "critical";
          result.autoReject = true;
        } else if (category === "violence" || category === "illegal") {
          result.severity = "high";
          result.autoReject = true;
        }
        break;
      }
    }
  }

  // Check for disclaimer-requiring content
  for (const [category, patterns] of Object.entries(disclaimerCategories)) {
    for (const pattern of patterns) {
      if (pattern.test(combinedText)) {
        result.disclaimersNeeded.push(category);
        break;
      }
    }
  }

  // Set approved status
  result.approved = !result.autoReject;

  // If flagged but not auto-rejected, mark for review
  if (result.flagged && !result.autoReject) {
    result.severity = result.severity === "low" ? "medium" : result.severity;
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, title, contentType, contentId, userId } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Filtering content: ${title || "untitled"} (${contentType})`);

    const result = analyzeContent(content, title);

    // If flagged, add to moderation queue
    if (result.flagged && contentId) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        await supabase.from("moderation_queue").insert({
          content_type: contentType || "unknown",
          content_id: contentId,
          flagged_reason: result.reasons.join(", "),
          auto_flagged: true,
          severity: result.severity,
          status: result.autoReject ? "auto_rejected" : "pending",
        });

        console.log(`Content added to moderation queue: ${contentId}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Content filter error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});