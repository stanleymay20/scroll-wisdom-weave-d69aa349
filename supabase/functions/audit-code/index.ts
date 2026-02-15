import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STO_AUDIT_PROMPT = `You are a Senior Technical Officer (STO) conducting a rigorous code audit.

OBJECTIVES:
1. Correctness — Ensure code executes without errors, validate imports, detect logical flaws
2. PEP8/Style — Enforce formatting, clear naming, modular structure, no anti-patterns
3. Reproducibility — Random seeds, deterministic examples, clear dataset references
4. Performance — Vectorization over loops, memory efficiency, scalable patterns
5. ML Best Practices — Proper train-test split, no data leakage, correct metrics, cross-validation
6. Deep Learning — Proper model patterns, correct loss functions, optimizer selection, training loops
7. MLOps/Deployment — Valid API patterns, correct serialization, Docker-ready structure

OUTPUT FORMAT (JSON):
{
  "chapterScore": <1-10>,
  "riskLevel": "low" | "medium" | "high",
  "codeBlocks": [
    {
      "index": <number>,
      "language": "<detected language>",
      "originalSnippet": "<first 3 lines of original>",
      "issues": ["<issue 1>", "<issue 2>"],
      "correctedCode": "<full corrected code>",
      "recommendations": ["<recommendation 1>"]
    }
  ],
  "overallRecommendations": ["<recommendation>"],
  "summary": "<2-3 sentence executive summary>"
}

Assume this book will be reviewed by a FAANG Staff Engineer. Rewrite any code that would not pass internal production review.
Be thorough. Do not skip small issues. If any code is amateur-level, rewrite it to industry standard.`;

function extractCodeBlocks(content: string): { code: string; language: string; index: number }[] {
  const blocks: { code: string; language: string; index: number }[] = [];
  
  // Match fenced code blocks
  const fencedRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  let idx = 0;
  while ((match = fencedRegex.exec(content)) !== null) {
    blocks.push({
      code: match[2].trim(),
      language: match[1] || 'unknown',
      index: idx++,
    });
  }
  
  // Match [CODE_BLOCK] tags
  const structuredRegex = /\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g;
  while ((match = structuredRegex.exec(content)) !== null) {
    blocks.push({
      code: match[1].trim(),
      language: 'structured',
      index: idx++,
    });
  }
  
  return blocks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterId, chapterTitle, chapterNumber, content } = await req.json();
    
    if (!content) {
      return new Response(JSON.stringify({ error: 'No content provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const codeBlocks = extractCodeBlocks(content);
    
    if (codeBlocks.length === 0) {
      return new Response(JSON.stringify({
        chapterId,
        chapterTitle,
        chapterNumber,
        result: {
          chapterScore: -1,
          riskLevel: 'none',
          codeBlocks: [],
          overallRecommendations: [],
          summary: 'No code blocks found in this chapter.',
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the audit request
    const codeBlocksText = codeBlocks.map((b, i) => 
      `--- Code Block ${i + 1} (${b.language}) ---\n${b.code}\n`
    ).join('\n');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      throw new Error('AI API key not configured');
    }

    // Retry logic for rate limits
    let response: Response | null = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: STO_AUDIT_PROMPT },
            {
              role: 'user',
              content: `Audit the following ${codeBlocks.length} code block(s) from Chapter ${chapterNumber}: "${chapterTitle}".\n\n${codeBlocksText}\n\nReturn ONLY valid JSON matching the specified format.`,
            },
          ],
          temperature: 0.2,
          max_tokens: 8000,
        }),
      });

      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt + 1) * 2000; // 4s, 8s, 16s
        console.log(`Rate limited on attempt ${attempt + 1}, waiting ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      if (response?.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited. Please wait a moment and try again with fewer chapters.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI API error: ${response?.status} - ${errorText}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response (handle markdown code fences)
    let jsonStr = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    let auditResult;
    try {
      auditResult = JSON.parse(jsonStr);
    } catch {
      auditResult = {
        chapterScore: 5,
        riskLevel: 'medium',
        codeBlocks: [],
        overallRecommendations: ['AI response could not be parsed. Manual review recommended.'],
        summary: rawContent.substring(0, 500),
      };
    }

    return new Response(JSON.stringify({
      chapterId,
      chapterTitle,
      chapterNumber,
      codeBlockCount: codeBlocks.length,
      result: auditResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Audit error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
