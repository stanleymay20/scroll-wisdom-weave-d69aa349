import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-REFERENCES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, category, language = "English" } = await req.json();

    logStep("Generating references", { topic: topic.slice(0, 100), category, language });

    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    if (!PERPLEXITY_API_KEY) {
      logStep("Perplexity not configured, returning placeholder");
      return new Response(
        JSON.stringify({
          success: true,
          references: [],
          note: "Reference verification not available. Citations marked as 'requires verification'.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Perplexity to find real academic references
    const searchQuery = `Academic sources and scholarly references for: ${topic} in ${category}. 
    Find peer-reviewed articles, books, and academic papers. Return author names, publication titles, years, and DOIs when available.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { 
            role: "system", 
            content: `You are an academic research assistant. Find and return REAL, VERIFIABLE academic references.
            Return as JSON array with format:
            [{"author": "Last, First", "title": "Full Title", "year": 2023, "type": "journal|book|article", "doi": "optional", "url": "optional"}]
            Only return sources that actually exist and can be verified. If uncertain, mark as "requires_verification": true.`
          },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic", // Use academic search mode
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("Perplexity error", { status: response.status, error: errorText });
      throw new Error("Failed to search for references");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    logStep("Perplexity response received", { citationCount: citations.length });

    // Parse references from response
    let references = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        references = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      logStep("Could not parse JSON references, using citations", { error: parseError });
      // Fallback: use citations array from Perplexity
      references = citations.map((url: string, i: number) => ({
        author: "Source",
        title: `Reference ${i + 1}`,
        year: new Date().getFullYear(),
        type: "web",
        url,
        requires_verification: true,
      }));
    }

    // Add citation URLs from Perplexity
    if (citations.length > 0) {
      references = references.map((ref: any, i: number) => ({
        ...ref,
        sourceUrl: citations[i] || ref.url,
      }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        references,
        citations, // Raw URLs from Perplexity
        note: "References sourced via Perplexity AI academic search. Verify before publication.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        references: [],
        note: "Reference generation failed. Please verify sources manually.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
