import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-REFERENCES] ${step}${detailsStr}`);
};

// 2026 Academic Reference Standard — Perplexity system prompt
const REFERENCE_SYSTEM_PROMPT = `You are a senior academic research librarian enforcing 2026 peer-reviewed publishing standards.

RULES (NON-NEGOTIABLE):
1. Return ONLY sources that are REAL and VERIFIABLE via DOI, ISBN, or institutional record.
2. Every source must be directly relevant to the specific paragraph/concept it supports.
3. Prioritize peer-reviewed journals, academic press books, and recognized scholarly databases.
4. NO ornamental, filler, or authority-inflation citations.
5. NO cross-disciplinary padding (e.g., materials science references in a finance book).
6. NO duplicate entries (same work in variant formats).

RECENCY REQUIREMENTS:
- At least 30% of references must be post-2010.
- At least 15% must be post-2018.
- Include at least one recent review or meta-analysis where applicable.
- Relevance > recency — do not inflate with irrelevant modern citations.

CANONICAL ANCHORING:
- If the topic involves Prospect Theory, include Kahneman & Tversky (1979).
- If the topic involves Loss Aversion, include Tversky & Kahneman (1992).
- If the topic involves Mental Accounting, include Thaler (1985).
- If the topic involves Disposition Effect, include Shefrin & Statman (1985).
- If the topic involves Equity Premium, include Benartzi & Thaler (1995).
- If the topic involves Behavioral Asset Pricing, include Barberis, Huang & Santos (2001).
- If the topic involves Investor Behavior, include Odean (1998) and Barber & Odean (2000/2001).
- For other domains, include foundational works appropriate to the field.

FORMAT: Return as JSON array with STRICT APA 7th fields:
[{
  "author": "Last, First Initial.",
  "title": "Full Title in Sentence Case",
  "year": 2023,
  "type": "journal|book|article|conference|preprint|thesis|report",
  "doi": "10.xxxx/xxxx (REQUIRED if available)",
  "url": "full URL if no DOI",
  "journal": "Journal Name (for journal articles)",
  "publisher": "Publisher (for books)",
  "volume": "vol number",
  "issue": "issue number",
  "pages": "page range",
  "peer_reviewed": true,
  "requires_verification": false
}]

ETHICAL STANDARDS:
- If you cannot verify a source exists, set "requires_verification": true.
- NEVER fabricate citations.
- NEVER use self-referential AI artifacts.
- If fewer than 5 verifiable sources exist, say so honestly.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
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

    logStep("Authenticated user", { userId: user.id.slice(0, 8) + "..." });

    const { topic, category, language = "English", chapterContent } = await req.json();

    logStep("Generating references", { topic: topic?.slice(0, 100), category, language });

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

    // Build context-aware search query
    const searchQuery = `Find REAL, VERIFIABLE academic references for: "${topic}" in the domain of ${category}.
${chapterContent ? `\nChapter context (first 2000 chars):\n${chapterContent.slice(0, 2000)}` : ''}

Requirements:
- Peer-reviewed journal articles, academic books, and scholarly papers ONLY.
- Include foundational/canonical works for the core concepts discussed.
- Include at least 30% post-2010 and 15% post-2018 sources.
- Return author names, full titles, years, DOIs, journal names, volumes, issues, and page ranges.
- Language preference: ${language}.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: REFERENCE_SYSTEM_PROMPT },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logStep("Perplexity error", { status: response.status });
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
      logStep("Could not parse JSON references, using citations");
      references = citations
        .filter((url: string) => url && url.startsWith('http'))
        .map((url: string, i: number) => ({
          author: "Unattributed Source",
          title: `Web Reference ${i + 1} — verification required`,
          year: new Date().getFullYear(),
          type: "web",
          url,
          requires_verification: true,
          peer_reviewed: false,
        }));
    }

    // AUDIT FIX: Hard-reject placeholder/fabricated references before post-processing.
    // Entries with "Unknown" author or generic "Reference N" titles are fabrication signals.
    const PLACEHOLDER_AUTHOR = /^(unknown|source|n\/a|anonymous)$/i;
    const PLACEHOLDER_TITLE = /^(reference\s+\d+|unknown|untitled|n\/a|web reference|article \d+)$/i;
    references = references.filter((ref: any) => {
      const author = String(ref.author || '').trim();
      const title = String(ref.title || '').trim();
      const isPlaceholder = PLACEHOLDER_AUTHOR.test(author) || PLACEHOLDER_TITLE.test(title);
      if (isPlaceholder) {
        logStep("Hard-rejecting placeholder reference", { author: author.slice(0, 40), title: title.slice(0, 40) });
      }
      return !isPlaceholder;
    });

    // Post-processing: enforce 2026 standards
    // Remove duplicates by DOI or title
    const seen = new Map();
    const deduped = [];
    const removed = [];
    for (const ref of references) {
      const key = ref.doi || `${(ref.title || '').toLowerCase().slice(0, 60)}|${ref.year}`;
      if (seen.has(key)) {
        removed.push({ ...ref, removal_reason: 'Duplicate entry' });
        continue;
      }
      seen.set(key, true);
      deduped.push(ref);
    }

    // Add citation URLs from Perplexity
    if (citations.length > 0) {
      for (let i = 0; i < deduped.length; i++) {
        if (citations[i] && !deduped[i].url) {
          deduped[i].sourceUrl = citations[i];
        }
      }
    }

    // Recency stats
    const total = deduped.length;
    const post2010 = deduped.filter((r: any) => r.year >= 2010).length;
    const post2018 = deduped.filter((r: any) => r.year >= 2018).length;

    return new Response(
      JSON.stringify({
        success: true,
        references: deduped,
        removed,
        citations,
        recencyStats: {
          total,
          post2010,
          post2018,
          post2010Pct: total > 0 ? Math.round((post2010 / total) * 100) : 0,
          post2018Pct: total > 0 ? Math.round((post2018 / total) * 100) : 0,
        },
        note: "References sourced via Perplexity AI academic search. Verify all DOIs independently before citing in formal academic work. AI-generated references may contain errors.",
        standard: "APA 7th Edition — AI-Assisted Reference Search",
        disclaimer: "This is an AI-assisted output. It does not constitute peer review or institutional endorsement.",
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
