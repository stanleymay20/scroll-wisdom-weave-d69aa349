import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Word count limits by tier
const TIER_WORD_LIMITS = {
  free: 4000,
  student: 8000,
  premium: 12000,
  prophet_tier: 16000,
};

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

    // Authenticate user from JWT token
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
      console.error("[GENERATE-CHAPTER] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GENERATE-CHAPTER] Authenticated user: ${user.id.slice(0, 8)}...`);

    // Get user's subscription plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    const maxWordCount = TIER_WORD_LIMITS[userPlan as keyof typeof TIER_WORD_LIMITS] || TIER_WORD_LIMITS.free;

    const { 
      chapterId, 
      bookTitle, 
      chapterTitle, 
      chapterNumber, 
      keyTopics, 
      category,
      wordCount = 4000,
      language = 'English',
      bookType = 'text',
    } = await req.json();

    // Verify user owns the book
    const { data: chapter } = await supabase
      .from("chapters")
      .select("book_id")
      .eq("id", chapterId)
      .single();

    if (chapter) {
      const { data: book } = await supabase
        .from("books")
        .select("creator_id")
        .eq("id", chapter.book_id)
        .single();

      if (book && book.creator_id !== user.id) {
        console.log(`[GENERATE-CHAPTER] User ${user.id.slice(0, 8)}... not authorized for book`);
        return new Response(JSON.stringify({ error: "Not authorized to modify this book" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Enforce word count limit based on subscription
    const effectiveWordCount = Math.min(wordCount, maxWordCount);
    if (wordCount > maxWordCount) {
      console.log(`[GENERATE-CHAPTER] Capping word count from ${wordCount} to ${maxWordCount} for ${userPlan} plan`);
    }
    
    // Map language code to full language name if code is passed
    const languageMap: Record<string, string> = {
      'en': 'English',
      'fr': 'French',
      'de': 'German',
      'es': 'Spanish',
      'ar': 'Arabic',
      'sw': 'Swahili',
      'pt': 'Portuguese'
    };
    const languageName = languageMap[language] || language;
    
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");

    console.log(`[GENERATE-CHAPTER] Generating chapter ${chapterNumber}: ${chapterTitle}`);
    console.log(`[GENERATE-CHAPTER] Target words: ${effectiveWordCount}, Language: ${languageName}, Type: ${bookType}, Plan: ${userPlan}`);

    // COMIC/CHILDREN BOOK - Visual-first with dialogues
    if (bookType === 'comic') {
      console.log("[GENERATE-CHAPTER] Generating comic book chapter with visual panels and dialogues...");
      
      const comicPrompt = `You are a professional comic book writer and illustrator. Create a COMIC BOOK STORY for "${chapterTitle}" from the book "${bookTitle}".

CRITICAL: This is a COMIC BOOK with visual storytelling AND character dialogues.

Create 5-7 PANELS for this chapter. For each panel, you MUST include:
1. [PANEL X]: Visual Description - Detailed scene for AI image generation
2. [DIALOGUE]: Character speech bubbles (who says what) - MANDATORY
3. [CAPTION]: Optional narration box (only if needed)

LANGUAGE: ALL text must be in ${languageName}.

Story context: ${keyTopics?.join(', ') || 'Tell an engaging visual story'}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

---

[PANEL 1]
**Visual:** [Detailed visual description - describe the scene, characters, their expressions, poses, setting, action, mood in 2-3 sentences. Be specific for AI image generation.]
**Dialogue:**
- CHARACTER_NAME: "What they say in speech bubble"
- CHARACTER_NAME: "Their response"
**Caption:** "[Optional narration - describe time/place/thought if needed]"

---

[PANEL 2]
**Visual:** [Next scene description...]
**Dialogue:**
- CHARACTER_NAME: "Speech..."
**Caption:** "[Optional]"

---

(Continue for 5-7 panels)

CRITICAL REQUIREMENTS:
- EVERY panel MUST have character dialogue (speech bubbles) - this is what makes it a comic!
- Dialogues should be natural, expressive, and move the story forward
- Use different characters talking to each other
- Include emotions, exclamations, questions in dialogue
- Visual descriptions should show characters' expressions matching their words
- Tell a complete story arc with beginning, conflict, and resolution
- Make dialogues age-appropriate and engaging
- Each panel should flow naturally to the next`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }
      
      const comicResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `You create visual storyboards for children's picture books. Your visual descriptions are detailed and vivid. Your captions are minimal and child-friendly. Write all captions in ${languageName}.` },
            { role: "user", content: comicPrompt }
          ],
        }),
      });

      if (!comicResponse.ok) {
        const errorText = await comicResponse.text();
        console.error("[GENERATE-CHAPTER] Comic generation error:", comicResponse.status, errorText);
        throw new Error("Failed to generate comic chapter");
      }

      const comicData = await comicResponse.json();
      let comicContent = comicData.choices?.[0]?.message?.content || "";
      
      console.log("[GENERATE-CHAPTER] Comic script generated, now generating images for panels...");

      // Parse panels and generate images for each - now with dialogues
      const panelRegex = /\[PANEL\s*(\d+)\]\s*\*\*Visual:\*\*\s*([\s\S]*?)\*\*Dialogue:\*\*\s*([\s\S]*?)(?:\*\*Caption:\*\*\s*"?([^"]*)"?)?(?=\s*---|\s*\[PANEL|\s*$)/gi;
      let match;
      const panels: { num: number; visual: string; dialogue: string; caption: string; imageUrl?: string }[] = [];
      
      while ((match = panelRegex.exec(comicContent)) !== null) {
        panels.push({
          num: parseInt(match[1]),
          visual: match[2].trim(),
          dialogue: match[3].trim(),
          caption: (match[4] || '').trim(),
        });
      }

      console.log(`[GENERATE-CHAPTER] Found ${panels.length} panels to illustrate`);

      // Generate images for each panel (limit to avoid rate limits)
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`[GENERATE-CHAPTER] Generating image for panel ${panel.num}...`);
          
          const imagePrompt = `Children's book illustration. ${panel.visual} Style: Colorful, friendly, child-safe, whimsical, professional children's book art. No text in image.`;
          
          const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image-preview",
              messages: [{ role: "user", content: imagePrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (imageResponse.ok) {
            const imageData = await imageResponse.json();
            const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (imageUrl) {
              panel.imageUrl = imageUrl;
              console.log(`[GENERATE-CHAPTER] Image generated for panel ${panel.num}`);
            }
          } else {
            console.error(`[GENERATE-CHAPTER] Failed to generate image for panel ${panel.num}`);
          }
          
          // Add delay to avoid rate limits
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`[GENERATE-CHAPTER] Image generation error for panel ${panel.num}:`, imgError);
        }
      }

      // Build final comic chapter content with images and dialogues
      let finalComicContent = `# ${chapterTitle}\n\n`;
      finalComicContent += `*A comic story from "${bookTitle}"*\n\n---\n\n`;
      
      for (const panel of panels) {
        finalComicContent += `## Panel ${panel.num}\n\n`;
        if (panel.imageUrl) {
          finalComicContent += `![Panel ${panel.num}](${panel.imageUrl})\n\n`;
        } else {
          finalComicContent += `*[Illustration: ${panel.visual.slice(0, 200)}...]*\n\n`;
        }
        // Add dialogue bubbles
        if (panel.dialogue) {
          const dialogueLines = panel.dialogue.split('\n').filter(l => l.trim().startsWith('-'));
          for (const line of dialogueLines) {
            const dialogueMatch = line.match(/-\s*([^:]+):\s*"?([^"]+)"?/);
            if (dialogueMatch) {
              const character = dialogueMatch[1].trim();
              const speech = dialogueMatch[2].trim();
              finalComicContent += `**${character}:** "${speech}"\n\n`;
            }
          }
        }
        // Add caption/narration if exists
        if (panel.caption) {
          finalComicContent += `*${panel.caption}*\n\n`;
        }
        finalComicContent += `---\n\n`;
      }

      const actualWordCount = finalComicContent.split(/\s+/).filter((word: string) => word.length > 0).length;
      console.log(`[GENERATE-CHAPTER] Comic chapter word count: ${actualWordCount}`);

      // Update chapter in database
      const { error: updateError } = await supabase
        .from("chapters")
        .update({
          content: finalComicContent,
          word_count: actualWordCount,
          is_generated: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chapterId);

      if (updateError) {
        console.error("[GENERATE-CHAPTER] Error updating comic chapter:", updateError);
        throw new Error(`Failed to save comic chapter: ${updateError.message}`);
      }

      console.log(`[GENERATE-CHAPTER] Comic chapter ${chapterNumber} saved successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          wordCount: actualWordCount,
          provider: 'Lovable AI (Comic)',
          panelCount: panels.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // STANDARD TEXT / ILLUSTRATED BOOK GENERATION

    // Validate and cap word count
    const targetWords = Math.min(Math.max(effectiveWordCount, 2000), 6000);
    const maxTokens = Math.min(Math.ceil(targetWords * 1.3), 8000);

    console.log(`[GENERATE-CHAPTER] Adjusted target words: ${targetWords}, max_tokens: ${maxTokens}`);

    // Check if DeepSeek is available, otherwise use Lovable AI
    const useDeepSeek = !!DEEPSEEK_API_KEY;
    console.log(`[GENERATE-CHAPTER] Using AI provider: ${useDeepSeek ? 'DeepSeek' : 'Lovable AI (Gemini)'}`);

    const chapterPrompt = `You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters.

Write Chapter ${chapterNumber}: "${chapterTitle}" for the book "${bookTitle}" in the ${category.replace(/_/g, " ")} category.

CRITICAL LANGUAGE REQUIREMENT - MANDATORY:
Generate ALL content strictly in ${languageName}.
Do NOT use English (unless ${languageName} IS English).
Do NOT mix languages.
Do NOT explain language choices.
Do NOT include any text in any language other than ${languageName}.
Every word, heading, example, and reference must be in ${languageName}.

Key topics to cover:
${keyTopics?.map((t: string) => `- ${t}`).join('\n') || '- Comprehensive coverage of the chapter topic'}

CRITICAL REQUIREMENTS:
1. Write approximately ${targetWords} words. Aim for quality over quantity.
2. WRITE ENTIRELY IN ${languageName} - this is non-negotiable.
3. Use proper markdown formatting:
   - ## for main section headers (in ${languageName})
   - ### for subsection headers (in ${languageName})
   - **bold** for emphasis
   - Bullet points and numbered lists where appropriate
4. Structure your chapter with these sections:
   - Introduction: Hook the reader, introduce the topic
   - Main sections (3-5): Cover key topics with examples and analysis
   - Key Takeaways: Summarize main points
   - Conclusion: Wrap up and transition
5. Include:
   - Real-world examples and case studies
   - Relevant insights and practical applications
   - Expert perspectives where appropriate
6. Write with academic rigor but remain accessible
7. NO filler, NO repetition - every paragraph must add unique value
8. This is a COMPLETE chapter - do not truncate or summarize

BEGIN WRITING THE FULL CHAPTER NOW IN ${languageName}:`;


    let chapterContent: string = "";
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        if (useDeepSeek) {
          console.log(`[GENERATE-CHAPTER] Calling DeepSeek API (attempt ${retryCount + 1}), max_tokens: ${maxTokens}...`);
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
                  content: `You are ScrollAuthorGPT, an elite AI author. You write EXCLUSIVELY in ${languageName}. You NEVER use any other language. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers. ALL your output must be in ${languageName} only.` 
                },
                { role: "user", content: chapterPrompt }
              ],
              max_tokens: maxTokens,
              temperature: 0.7,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[GENERATE-CHAPTER] DeepSeek API error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`[GENERATE-CHAPTER] Rate limited, waiting ${5000 * retryCount}ms before retry...`);
                await new Promise(r => setTimeout(r, 5000 * retryCount));
                continue;
              }
              throw new Error("Rate limits exceeded, please try again later.");
            }
            if (response.status === 402 || response.status === 401) {
              throw new Error("DeepSeek API authentication failed. Please check your API key.");
            }
            throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          chapterContent = data.choices?.[0]?.message?.content;
          console.log("[GENERATE-CHAPTER] DeepSeek response received successfully");
          break;
        } else {
          // Use Lovable AI (Gemini) as fallback
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            throw new Error("No AI API key configured (DEEPSEEK_API_KEY or LOVABLE_API_KEY required)");
          }
          
          console.log(`[GENERATE-CHAPTER] Calling Lovable AI Gemini (attempt ${retryCount + 1})...`);
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { 
                  role: "system", 
                  content: `You are ScrollAuthorGPT, an elite AI author. You write EXCLUSIVELY in ${languageName}. You NEVER use any other language. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers. ALL your output must be in ${languageName} only.` 
                },
                { role: "user", content: chapterPrompt }
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[GENERATE-CHAPTER] Lovable AI gateway error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`[GENERATE-CHAPTER] Rate limited, waiting ${5000 * retryCount}ms before retry...`);
                await new Promise(r => setTimeout(r, 5000 * retryCount));
                continue;
              }
              throw new Error("Rate limits exceeded, please try again later.");
            }
            throw new Error(`Lovable AI error: ${response.status}`);
          }

          const data = await response.json();
          chapterContent = data.choices?.[0]?.message?.content;
          console.log("[GENERATE-CHAPTER] Lovable AI response received successfully");
          break;
        }
      } catch (error) {
        console.error(`[GENERATE-CHAPTER] Attempt ${retryCount + 1} failed:`, error);
        if (retryCount >= maxRetries - 1) throw error;
        retryCount++;
        await new Promise(r => setTimeout(r, 3000 * retryCount));
      }
    }

    if (!chapterContent) {
      throw new Error("No content generated after retries");
    }

    console.log(`[GENERATE-CHAPTER] Generated chapter content: ${chapterContent.length} characters`);

    let finalContent = chapterContent;

    if (bookType === 'illustrated') {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      console.log("[GENERATE-CHAPTER] Generating illustration prompts...");

      const illustrationPrompt = `Create 4 illustration ideas for Chapter ${chapterNumber}: "${chapterTitle}" from "${bookTitle}".

CRITICAL:
- This is an ILLUSTRATED book (text already written). You are proposing images.
- NO long prose. Return only the 4 image prompts.
- Each prompt must be safe, non-violent, and suitable for general audiences.
- NO text inside the image.

FORMAT EXACTLY:

---

[ILLUSTRATION 1]
**Visual:** [2-3 sentence scene description for an AI image generator]

---

[ILLUSTRATION 2]
**Visual:** ...

---

[ILLUSTRATION 3]
**Visual:** ...

---

[ILLUSTRATION 4]
**Visual:** ...

TOPIC CONTEXT: ${keyTopics?.join(', ') || chapterTitle}`;

      try {
        const illustrationResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You create illustration concepts for educational books. Be concise." },
              { role: "user", content: illustrationPrompt }
            ],
          }),
        });

        if (illustrationResponse.ok) {
          const illustrationData = await illustrationResponse.json();
          const illustrationContent = illustrationData.choices?.[0]?.message?.content || "";
          
          // Parse illustration prompts
          const illustrationRegex = /\[ILLUSTRATION\s*(\d+)\]\s*\*\*Visual:\*\*\s*([\s\S]*?)(?=\s*---|\s*\[ILLUSTRATION|\s*$)/gi;
          const illustrations: { num: number; visual: string; imageUrl?: string }[] = [];
          let illMatch;
          
          while ((illMatch = illustrationRegex.exec(illustrationContent)) !== null) {
            illustrations.push({
              num: parseInt(illMatch[1]),
              visual: illMatch[2].trim(),
            });
          }

          console.log(`[GENERATE-CHAPTER] Found ${illustrations.length} illustration prompts`);

          // Generate images for each illustration (limit to 3 to avoid rate limits)
          for (let i = 0; i < Math.min(illustrations.length, 3); i++) {
            const ill = illustrations[i];
            try {
              console.log(`[GENERATE-CHAPTER] Generating illustration ${ill.num}...`);
              
              const imagePrompt = `Educational book illustration. ${ill.visual} Style: Professional, clean, educational, suitable for scholarly publication. No text in image.`;
              
              const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash-image-preview",
                  messages: [{ role: "user", content: imagePrompt }],
                  modalities: ["image", "text"],
                }),
              });

              if (imageResponse.ok) {
                const imageData = await imageResponse.json();
                const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
                if (imageUrl) {
                  ill.imageUrl = imageUrl;
                  console.log(`[GENERATE-CHAPTER] Illustration ${ill.num} generated`);
                }
              }
              
              await new Promise(r => setTimeout(r, 1000));
            } catch (imgError) {
              console.error(`[GENERATE-CHAPTER] Illustration ${ill.num} error:`, imgError);
            }
          }

          // Insert illustrations into chapter content
          if (illustrations.some(ill => ill.imageUrl)) {
            const sections = finalContent.split(/(?=## )/);
            const insertPoints = [1, Math.floor(sections.length / 2), sections.length - 1];
            
            let illustrationIndex = 0;
            for (const point of insertPoints) {
              if (illustrationIndex < illustrations.length && illustrations[illustrationIndex].imageUrl && point < sections.length) {
                const ill = illustrations[illustrationIndex];
                sections[point] += `\n\n![Illustration ${ill.num}](${ill.imageUrl})\n*${ill.visual.slice(0, 100)}*\n\n`;
                illustrationIndex++;
              }
            }
            
            finalContent = sections.join('');
          }
        }
      } catch (illError) {
        console.error("[GENERATE-CHAPTER] Illustration generation failed:", illError);
      }
    }

    // Calculate word count
    const actualWordCount = finalContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    console.log(`[GENERATE-CHAPTER] Chapter word count: ${actualWordCount}`);

    // Update chapter in database
    const { error: updateError } = await supabase
      .from("chapters")
      .update({
        content: finalContent,
        word_count: actualWordCount,
        is_generated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chapterId);

    if (updateError) {
      console.error("[GENERATE-CHAPTER] Error updating chapter:", updateError);
      throw new Error(`Failed to save chapter: ${updateError.message}`);
    }

    console.log(`[GENERATE-CHAPTER] Chapter ${chapterNumber} saved successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        wordCount: actualWordCount,
        provider: useDeepSeek ? 'DeepSeek' : 'Lovable AI (Gemini)',
        bookType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[GENERATE-CHAPTER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
