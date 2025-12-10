import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterId, bookTitle, chapterTitle, chapterNumber, keyTopics, category } = await req.json();
    
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    // Prefer DeepSeek for long-form content, fallback to Lovable AI
    const useDeepSeek = !!DEEPSEEK_API_KEY;
    
    if (!useDeepSeek && !LOVABLE_API_KEY) {
      throw new Error("No AI API key configured (DEEPSEEK_API_KEY or LOVABLE_API_KEY required)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Generating chapter ${chapterNumber}: ${chapterTitle} for book: ${bookTitle}`);
    console.log(`Using AI provider: ${useDeepSeek ? 'DeepSeek' : 'Lovable AI'}`);

    const chapterPrompt = `You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters.

Write Chapter ${chapterNumber}: "${chapterTitle}" for the book "${bookTitle}" in the ${category.replace(/_/g, " ")} category.

Key topics to cover:
${keyTopics?.map((t: string) => `- ${t}`).join('\n') || '- Comprehensive coverage of the chapter topic'}

CRITICAL REQUIREMENTS:
1. You MUST write AT LEAST 8,000 words. This is non-negotiable. Aim for 10,000-12,000 words.
2. Use proper markdown formatting:
   - ## for main section headers
   - ### for subsection headers  
   - **bold** for emphasis
   - Bullet points and numbered lists where appropriate
3. Structure your chapter with these sections:
   - Introduction (500+ words): Hook the reader, introduce the topic, preview what's coming
   - Section 1 (1,500+ words): First major topic with examples and analysis
   - Section 2 (1,500+ words): Second major topic with case studies
   - Section 3 (1,500+ words): Third major topic with practical applications
   - Section 4 (1,500+ words): Fourth major topic with deeper insights
   - Section 5 (1,000+ words): Advanced concepts or special considerations
   - Key Takeaways (300+ words): Summarize main points
   - Conclusion (500+ words): Wrap up and transition to next chapter
4. Include:
   - Real-world examples and case studies
   - Relevant statistics and data points
   - Expert quotes or historical references
   - Practical applications and actionable insights
5. Write with academic rigor but remain accessible
6. NO filler, NO repetition - every paragraph must add unique value
7. This is a COMPLETE chapter - do not truncate or summarize

BEGIN WRITING THE FULL CHAPTER NOW:`;

    let chapterContent: string;

    if (useDeepSeek) {
      // Use DeepSeek API for long-form content
      console.log("Calling DeepSeek API...");
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { 
              role: "system", 
              content: "You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters. You ALWAYS write at least 8,000 words per chapter. You never truncate or abbreviate. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers." 
            },
            { role: "user", content: chapterPrompt }
          ],
          max_tokens: 16000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("DeepSeek API error:", response.status, errorText);
        
        if (response.status === 429) {
          throw new Error("Rate limits exceeded, please try again later.");
        }
        if (response.status === 402 || response.status === 401) {
          throw new Error("DeepSeek API authentication failed. Please check your API key.");
        }
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      chapterContent = data.choices?.[0]?.message?.content;
      console.log("DeepSeek response received");
    } else {
      // Fallback to Lovable AI
      console.log("Calling Lovable AI...");
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { 
              role: "system", 
              content: "You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters. You ALWAYS write at least 8,000 words per chapter. You never truncate or abbreviate. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers." 
            },
            { role: "user", content: chapterPrompt }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Lovable AI gateway error:", response.status, errorText);
        
        if (response.status === 429) {
          throw new Error("Rate limits exceeded, please try again later.");
        }
        if (response.status === 402) {
          throw new Error("Payment required, please add funds to your workspace.");
        }
        throw new Error("Failed to generate chapter content");
      }

      const data = await response.json();
      chapterContent = data.choices?.[0]?.message?.content;
      console.log("Lovable AI response received");
    }

    if (!chapterContent) {
      throw new Error("No content generated");
    }

    console.log(`Generated chapter content: ${chapterContent.length} characters`);

    // Calculate word count
    const wordCount = chapterContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    console.log(`Word count: ${wordCount}`);

    // Update chapter in database
    const { error: updateError } = await supabase
      .from("chapters")
      .update({
        content: chapterContent,
        word_count: wordCount,
        is_generated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapterId);

    if (updateError) {
      console.error("Error updating chapter:", updateError);
      throw new Error(`Failed to save chapter: ${updateError.message}`);
    }

    console.log(`Chapter ${chapterNumber} saved successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        wordCount,
        provider: useDeepSeek ? 'DeepSeek' : 'Lovable AI',
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-chapter function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
