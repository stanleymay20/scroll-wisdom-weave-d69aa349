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

interface Reference {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  requires_verification?: boolean;
}

interface ResearchResult {
  references: Reference[];
  inTextCitations: string[];
  metadata: {
    source_count: number;
    source_types: Record<string, number>;
    confidence_score: string;
    research_date: string;
  };
}

// Format in-text citation based on style
function formatInTextCitation(ref: Reference, style: string): string {
  const { author, year } = ref;
  const lastName = author.split(',')[0] || author.split(' ').pop() || author;
  
  switch (style) {
    case 'APA':
      return `(${lastName}, ${year})`;
    case 'MLA':
      return `(${lastName})`;
    case 'Harvard':
      return `(${lastName} ${year})`;
    case 'Chicago':
      return `[${lastName}, ${year}]`;
    default:
      return `(${lastName}, ${year})`;
  }
}

// Research pipeline using Perplexity
async function conductResearch(
  topic: string,
  category: string,
  keyTopics: string[],
  citationStyle: string
): Promise<ResearchResult> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  
  if (!PERPLEXITY_API_KEY) {
    console.log("[RESEARCH] Perplexity not configured, returning empty research");
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "No citations",
        research_date: new Date().toISOString(),
      },
    };
  }

  console.log("[RESEARCH] Conducting academic research with Perplexity...");

  try {
    // Topic decomposition and source retrieval
    const searchQuery = `Find peer-reviewed academic sources for: "${topic}" in ${category.replace(/_/g, " ")}.
    
Key areas to research:
${keyTopics.map(t => `- ${t}`).join('\n')}

Requirements:
1. Find peer-reviewed journal articles
2. Find academic textbooks and scholarly books  
3. Find university publications and institutional reports
4. Find reputable publisher materials

For each source, provide:
- Full author name(s)
- Complete title
- Publication year
- Type (journal, book, article, report)
- DOI if available
- URL if available
- Journal name or publisher

Return ONLY real, verifiable sources. Do not fabricate any citations.
Return as JSON array.`;

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
            content: `You are an academic research assistant. Find REAL, VERIFIABLE academic references only.
Return as JSON array with format:
[{"author": "Last, First", "title": "Full Title", "year": 2023, "type": "journal|book|article|report", "doi": "optional", "url": "optional", "journal": "optional", "publisher": "optional"}]
Only include sources that actually exist and can be verified. If uncertain about a source, add "requires_verification": true.
Return between 5-15 high-quality sources.`
          },
          { role: "user", content: searchQuery }
        ],
        search_mode: "academic",
      }),
    });

    if (!response.ok) {
      console.error("[RESEARCH] Perplexity error:", response.status);
      throw new Error("Perplexity API error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    console.log("[RESEARCH] Perplexity response received, citations:", citations.length);

    // Parse references from response
    let references: Reference[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        references = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.log("[RESEARCH] Could not parse JSON, using citation URLs");
      references = citations.slice(0, 10).map((url: string, i: number) => ({
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
      references = references.map((ref: Reference, i: number) => ({
        ...ref,
        url: ref.url || citations[i] || undefined,
      }));
    }

    // Calculate source type counts
    const sourceTypes: Record<string, number> = {};
    references.forEach((ref: Reference) => {
      const type = ref.type || 'article';
      sourceTypes[type] = (sourceTypes[type] || 0) + 1;
    });

    // Determine confidence score
    let confidenceScore = "No citations";
    if (references.length >= 10) confidenceScore = "High citation density";
    else if (references.length >= 5) confidenceScore = "Moderate";
    else if (references.length >= 1) confidenceScore = "Introductory overview";

    // Generate in-text citations
    const inTextCitations = references.map((ref: Reference) => 
      formatInTextCitation(ref, citationStyle)
    );

    return {
      references,
      inTextCitations,
      metadata: {
        source_count: references.length,
        source_types: sourceTypes,
        confidence_score: confidenceScore,
        research_date: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[RESEARCH] Error:", error);
    return {
      references: [],
      inTextCitations: [],
      metadata: {
        source_count: 0,
        source_types: {},
        confidence_score: "Research failed",
        research_date: new Date().toISOString(),
      },
    };
  }
}

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
      academicMode = false,
      citationStyle = 'APA',
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
    console.log(`[GENERATE-CHAPTER] Academic Mode: ${academicMode}, Citation Style: ${citationStyle}`);

    // ACADEMIC RESEARCH MODE - Conduct research first
    let researchResult: ResearchResult | null = null;
    if (academicMode && bookType === 'text') {
      console.log("[GENERATE-CHAPTER] Academic mode enabled, conducting research pipeline...");
      researchResult = await conductResearch(
        `${chapterTitle} - ${bookTitle}`,
        category,
        keyTopics || [chapterTitle],
        citationStyle
      );
      console.log(`[GENERATE-CHAPTER] Research complete: ${researchResult.metadata.source_count} sources found`);

      // If no sources found and academic mode is mandatory, warn but continue
      if (researchResult.references.length === 0) {
        console.log("[GENERATE-CHAPTER] Warning: No sources found, generating with verification notice");
      }
    }

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

    // Build the chapter prompt - include academic requirements if in academic mode
    let academicInstructions = '';
    let referenceSection = '';
    
    if (academicMode && researchResult && researchResult.references.length > 0) {
      const citationExamples = researchResult.inTextCitations.slice(0, 5).join(', ');
      academicInstructions = `

ACADEMIC RESEARCH MODE REQUIREMENTS (MANDATORY):
This is academic content requiring verified citations.

Available sources to cite (USE THESE):
${researchResult.references.slice(0, 10).map((ref, i) => 
  `${i + 1}. ${ref.author} (${ref.year}). "${ref.title}" - Citation: ${researchResult.inTextCitations[i]}`
).join('\n')}

CITATION REQUIREMENTS:
1. Include in-text citations using ${citationStyle} format: ${citationExamples}
2. Cite sources when making claims, stating facts, or referencing research
3. Every major claim MUST have a citation
4. Do NOT fabricate citations - only use the sources provided above
5. If making a claim without a source, mark it as "[requires verification]"

`;
      
      referenceSection = `

---

## References

${researchResult.references.map((ref) => {
        const lastName = ref.author.split(',')[0] || ref.author.split(' ').pop() || ref.author;
        switch (citationStyle) {
          case 'APA':
            return `${ref.author} (${ref.year}). *${ref.title}*.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : ''}`;
          case 'MLA':
            return `${ref.author}. "${ref.title}."${ref.journal ? ` *${ref.journal}*,` : ''} ${ref.year}.${ref.url ? ` ${ref.url}` : ''}`;
          case 'Harvard':
            return `${ref.author} (${ref.year}) ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.url ? ` Available at: ${ref.url}` : ''}`;
          case 'Chicago':
            return `${ref.author}. ${ref.title}.${ref.publisher ? ` ${ref.publisher},` : ''} ${ref.year}.${ref.url ? ` ${ref.url}.` : ''}`;
          default:
            return `${ref.author} (${ref.year}). ${ref.title}.`;
        }
      }).join('\n\n')}
`;
    } else if (academicMode) {
      academicInstructions = `

ACADEMIC RESEARCH MODE:
This is academic content. Include proper citations where possible.
Mark claims without sources as "[requires verification]".
Use ${citationStyle} citation format.
`;
    }

    const chapterPrompt = `You are ScrollAuthorGPT, an elite AI author renowned for creating comprehensive, scholarly book chapters.

Write Chapter ${chapterNumber}: "${chapterTitle}" for the book "${bookTitle}" in the ${category.replace(/_/g, " ")} category.

CRITICAL LANGUAGE REQUIREMENT - MANDATORY:
Generate ALL content strictly in ${languageName}.
Do NOT use English (unless ${languageName} IS English).
Do NOT mix languages.
Do NOT explain language choices.
Do NOT include any text in any language other than ${languageName}.
Every word, heading, example, and reference must be in ${languageName}.
${academicInstructions}
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
                  content: `You are ScrollAuthorGPT, an elite AI author. You write EXCLUSIVELY in ${languageName}. You NEVER use any other language. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers. ALL your output must be in ${languageName} only.${academicMode ? ' You always include proper academic citations.' : ''}` 
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
                  content: `You are ScrollAuthorGPT, an elite AI author. You write EXCLUSIVELY in ${languageName}. You NEVER use any other language. You write with depth, wisdom, academic rigor, and engaging prose that educates and inspires readers. ALL your output must be in ${languageName} only.${academicMode ? ' You always include proper academic citations.' : ''}` 
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

    // Add reference section for academic mode
    if (academicMode && referenceSection) {
      finalContent += referenceSection;
    }

    if (bookType === 'illustrated') {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      console.log("[GENERATE-CHAPTER] Generating context-aware illustration prompts...");

      // Extract key concepts from the generated content for relevant illustrations
      const contentSummary = chapterContent.slice(0, 2000);

      const illustrationPrompt = `Analyze this chapter content and create 4 HIGHLY RELEVANT illustration ideas that directly visualize the key concepts discussed.

CHAPTER CONTENT EXCERPT:
${contentSummary}

CHAPTER: "${chapterTitle}" from "${bookTitle}"
CATEGORY: ${category.replace(/_/g, " ")}
KEY TOPICS: ${keyTopics?.join(', ') || chapterTitle}

CRITICAL REQUIREMENTS:
1. Each illustration MUST directly relate to specific concepts, examples, or ideas mentioned in the chapter
2. Reference actual content from the text (people, events, concepts, examples mentioned)
3. Create educational visuals that help readers understand the material
4. NO generic or abstract imagery - be SPECIFIC to the chapter content
5. Each prompt must be safe, non-violent, and suitable for general audiences
6. NO text inside the image

FORMAT EXACTLY:

---

[ILLUSTRATION 1]
**Concept:** [Which specific topic/section this illustrates]
**Visual:** [2-3 sentence detailed scene description for AI image generator, referencing actual chapter content]

---

[ILLUSTRATION 2]
**Concept:** [Which specific topic/section this illustrates]
**Visual:** [Scene description...]

---

[ILLUSTRATION 3]
**Concept:** [Which specific topic/section this illustrates]
**Visual:** [Scene description...]

---

[ILLUSTRATION 4]
**Concept:** [Which specific topic/section this illustrates]
**Visual:** [Scene description...]`;

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
          
          // Parse illustration prompts with concept context
          const illustrationRegex = /\[ILLUSTRATION\s*(\d+)\]\s*(?:\*\*Concept:\*\*\s*([\s\S]*?))?\*\*Visual:\*\*\s*([\s\S]*?)(?=\s*---|\s*\[ILLUSTRATION|\s*$)/gi;
          const illustrations: { num: number; concept: string; visual: string; imageUrl?: string }[] = [];
          let illMatch;
          
          while ((illMatch = illustrationRegex.exec(illustrationContent)) !== null) {
            illustrations.push({
              num: parseInt(illMatch[1]),
              concept: (illMatch[2] || '').trim(),
              visual: illMatch[3].trim(),
            });
          }

          console.log(`[GENERATE-CHAPTER] Found ${illustrations.length} illustration prompts`);

          // Generate images for each illustration (limit to 3 to avoid rate limits)
          for (let i = 0; i < Math.min(illustrations.length, 3); i++) {
            const ill = illustrations[i];
            try {
              console.log(`[GENERATE-CHAPTER] Generating illustration ${ill.num} for: ${ill.concept || 'chapter content'}...`);
              
              // Include category context for more relevant imagery
              const imagePrompt = `Educational book illustration for ${category.replace(/_/g, " ")} topic. ${ill.visual} Context: ${ill.concept || chapterTitle}. Style: Professional, clean, educational, realistic, suitable for scholarly publication. Accurate depiction of the subject matter. No text in image.`;
              
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
                const caption = ill.concept ? `${ill.concept}: ${ill.visual.slice(0, 80)}` : ill.visual.slice(0, 100);
                sections[point] += `\n\n![Illustration: ${ill.concept || 'Chapter concept'}](${ill.imageUrl})\n*${caption}*\n\n`;
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

    // Prepare update object with academic metadata
    const updateData: Record<string, any> = {
      content: finalContent,
      word_count: actualWordCount,
      is_generated: true,
      updated_at: new Date().toISOString(),
    };

    // Add academic metadata if in academic mode
    if (academicMode && researchResult) {
      updateData.academic_mode = true;
      updateData.citation_style = citationStyle;
      updateData.chapter_references = researchResult.references;
      updateData.research_metadata = researchResult.metadata;
    }

    // Update chapter in database
    const { error: updateError } = await supabase
      .from("chapters")
      .update(updateData)
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
        academicMode,
        referenceCount: researchResult?.references.length || 0,
        researchMetadata: researchResult?.metadata || null,
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
