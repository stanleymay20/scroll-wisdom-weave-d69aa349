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
    const { 
      chapterId, 
      bookTitle, 
      chapterTitle, 
      chapterNumber, 
      keyTopics, 
      category,
      wordCount = 4000,
      language = 'English',
      bookType = 'text', // text, illustrated, comic
    } = await req.json();
    
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
    // Accept either language code or full name
    const languageName = languageMap[language] || language;
    
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Generating chapter ${chapterNumber}: ${chapterTitle} for book: ${bookTitle}`);
    console.log(`Target word count: ${wordCount}, Language: ${language}, Book type: ${bookType}`);

    // COMIC/CHILDREN BOOK - Visual-first with dialogues
    if (bookType === 'comic') {
      console.log("Generating comic book chapter with visual panels and dialogues...");
      
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
        console.error("Comic generation error:", comicResponse.status, errorText);
        throw new Error("Failed to generate comic chapter");
      }

      const comicData = await comicResponse.json();
      let comicContent = comicData.choices?.[0]?.message?.content || "";
      
      console.log("Comic script generated, now generating images for panels...");

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

      console.log(`Found ${panels.length} panels to illustrate`);

      // Generate images for each panel (limit to avoid rate limits)
      for (let i = 0; i < Math.min(panels.length, 6); i++) {
        const panel = panels[i];
        try {
          console.log(`Generating image for panel ${panel.num}...`);
          
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
              console.log(`Image generated for panel ${panel.num}`);
            }
          } else {
            console.error(`Failed to generate image for panel ${panel.num}`);
          }
          
          // Add delay to avoid rate limits
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`Image generation error for panel ${panel.num}:`, imgError);
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
      console.log(`Comic chapter word count: ${actualWordCount}`);

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
        console.error("Error updating comic chapter:", updateError);
        throw new Error(`Failed to save comic chapter: ${updateError.message}`);
      }

      console.log(`Comic chapter ${chapterNumber} saved successfully`);

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

    // Validate and cap word count - DeepSeek max_tokens is 8192
    // ~1.3 tokens per word, so max ~6000 words per API call
    const targetWords = Math.min(Math.max(wordCount, 2000), 6000);
    
    // DeepSeek max_tokens is 8192 - leave room for prompt tokens
    const maxTokens = Math.min(Math.ceil(targetWords * 1.3), 8000);

    console.log(`Adjusted target words: ${targetWords}, max_tokens: ${maxTokens}`);

    // Check if DeepSeek is available, otherwise use Lovable AI
    const useDeepSeek = !!DEEPSEEK_API_KEY;
    console.log(`Using AI provider: ${useDeepSeek ? 'DeepSeek' : 'Lovable AI (Gemini)'}`);

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
          console.log(`Calling DeepSeek API (attempt ${retryCount + 1}), max_tokens: ${maxTokens}...`);
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
            console.error("DeepSeek API error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`Rate limited, waiting ${5000 * retryCount}ms before retry...`);
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
          console.log("DeepSeek response received successfully");
          break;
        } else {
          // Use Lovable AI (Gemini) as fallback
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) {
            throw new Error("No AI API key configured (DEEPSEEK_API_KEY or LOVABLE_API_KEY required)");
          }
          
          console.log(`Calling Lovable AI Gemini (attempt ${retryCount + 1})...`);
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
            console.error("Lovable AI gateway error:", response.status, errorText);
            
            if (response.status === 429) {
              if (retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`Rate limited, waiting ${5000 * retryCount}ms before retry...`);
                await new Promise(r => setTimeout(r, 5000 * retryCount));
                continue;
              }
              throw new Error("Rate limits exceeded, please try again later.");
            }
            throw new Error(`Lovable AI error: ${response.status}`);
          }

          const data = await response.json();
          chapterContent = data.choices?.[0]?.message?.content;
          console.log("Lovable AI response received successfully");
          break;
        }
      } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed:`, error);
        if (retryCount >= maxRetries - 1) throw error;
        retryCount++;
        await new Promise(r => setTimeout(r, 3000 * retryCount));
      }
    }

    if (!chapterContent) {
      throw new Error("No content generated after retries");
    }

    console.log(`Generated chapter content: ${chapterContent.length} characters`);

    let finalContent = chapterContent;

    if (bookType === 'illustrated') {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      console.log("Generating illustration prompts...");

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

---`;

      const promptResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You create concise illustration prompts. Do not write chapter text. All descriptions must be in ${languageName}.`,
            },
            { role: "user", content: illustrationPrompt },
          ],
        }),
      });

      if (!promptResp.ok) {
        const t = await promptResp.text();
        console.error("Illustration prompt generation failed:", promptResp.status, t);
        throw new Error("Failed to generate illustration prompts");
      }

      const promptData = await promptResp.json();
      const promptText: string = promptData.choices?.[0]?.message?.content || "";

      const illRegex = /\[ILLUSTRATION\s*(\d+)\][\s\S]*?\*\*Visual:\*\*\s*([\s\S]*?)(?=\n\s*---|\n\s*\[ILLUSTRATION|\s*$)/gi;
      const illustrations: { num: number; visual: string; imageUrl?: string }[] = [];
      let m;
      while ((m = illRegex.exec(promptText)) !== null) {
        illustrations.push({ num: parseInt(m[1]), visual: m[2].trim() });
      }

      console.log(`Found ${illustrations.length} illustration prompts`);

      for (let i = 0; i < Math.min(illustrations.length, 4); i++) {
        const ill = illustrations[i];
        try {
          console.log(`Generating image for illustration ${ill.num}...`);
          const imagePrompt = `Book illustration (no text). ${ill.visual} Style: cinematic, detailed, professional illustration, high quality. No words or letters in the image.`;

          const imgResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

          if (imgResp.ok) {
            const imgData = await imgResp.json();
            const imageUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (imageUrl) ill.imageUrl = imageUrl;
          } else {
            const t = await imgResp.text();
            console.error(`Image generation failed for illustration ${ill.num}:`, imgResp.status, t);
          }

          await new Promise((r) => setTimeout(r, 1000));
        } catch (imgError) {
          console.error(`Image generation error for illustration ${ill.num}:`, imgError);
        }
      }

      if (illustrations.length > 0) {
        finalContent += `\n\n---\n\n## Illustrations\n\n`;
        for (const ill of illustrations.slice(0, 4)) {
          finalContent += `### Illustration ${ill.num}\n\n`;
          if (ill.imageUrl) {
            finalContent += `![Illustration ${ill.num}](${ill.imageUrl})\n\n`;
          } else {
            finalContent += `*Illustration idea:* ${ill.visual}\n\n`;
          }
        }
      }
    }

    // Calculate word count
    const actualWordCount = finalContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    console.log(`Actual word count: ${actualWordCount}`);

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
      console.error("Error updating chapter:", updateError);
      throw new Error(`Failed to save chapter: ${updateError.message}`);
    }

    console.log(`Chapter ${chapterNumber} saved successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        wordCount: actualWordCount,
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
