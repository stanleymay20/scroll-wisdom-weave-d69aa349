import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, category, numChapters } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Generating book: ${title} with ${numChapters} chapters`);

    // First, generate the book outline
    const outlinePrompt = `You are ScrollResearchGPT, an AI agent specialized in creating comprehensive book outlines.

Create a detailed outline for a book with the following specifications:
- Title: ${title}
- Description: ${description || "A comprehensive exploration of the topic"}
- Category: ${category}
- Number of Chapters: ${numChapters}

For each chapter, provide:
1. Chapter number
2. Chapter title
3. Brief description (2-3 sentences)
4. Key topics to cover (4-5 bullet points)

The book must be:
- Academically rigorous
- Well-structured with logical flow
- Each chapter should naturally lead to the next
- Rich in depth and substance

Format your response as a JSON object with this structure:
{
  "bookTitle": "string",
  "bookDescription": "string",
  "chapters": [
    {
      "chapterNumber": number,
      "title": "string",
      "description": "string",
      "keyTopics": ["string", "string", ...]
    }
  ]
}`;

    const outlineResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a scholarly AI that creates detailed, well-structured book outlines. Always respond with valid JSON." },
          { role: "user", content: outlinePrompt }
        ],
      }),
    });

    if (!outlineResponse.ok) {
      const errorText = await outlineResponse.text();
      console.error("AI gateway error:", outlineResponse.status, errorText);
      
      if (outlineResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (outlineResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to generate book outline");
    }

    const outlineData = await outlineResponse.json();
    const outlineContent = outlineData.choices?.[0]?.message?.content;
    
    console.log("Generated outline:", outlineContent);

    // Parse the outline
    let bookOutline;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = outlineContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        bookOutline = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse outline:", parseError);
      bookOutline = {
        bookTitle: title,
        bookDescription: description || "A comprehensive exploration of the topic",
        chapters: Array.from({ length: numChapters }, (_, i) => ({
          chapterNumber: i + 1,
          title: `Chapter ${i + 1}`,
          description: "Chapter content pending generation",
          keyTopics: ["Topic 1", "Topic 2", "Topic 3"],
        })),
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Book outline generated successfully",
        outline: bookOutline,
        note: "Chapter content generation will be handled separately due to the extensive word count requirements (8,000+ words per chapter).",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-book function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
