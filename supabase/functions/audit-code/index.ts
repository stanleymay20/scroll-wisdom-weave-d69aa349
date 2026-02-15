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
8. Data Visualization — If code includes matplotlib, seaborn, plotly, or any plotting library:
   - Ensure plots have proper labels (xlabel, ylabel, title)
   - Verify legends are included where multiple series exist
   - Check for colorblind-friendly palettes
   - Recommend plt.tight_layout() or fig.set_tight_layout(True)
   - Ensure figures are properly sized (figsize parameter)
   - Add concrete visualization examples if the chapter topic is data visualization

CRITICAL: You MUST return ONLY valid JSON. No markdown fences. No explanatory text before or after.
Do NOT wrap the output in backtick fences. Return raw JSON directly.

OUTPUT FORMAT (raw JSON only):
{
  "chapterScore": <1-10>,
  "riskLevel": "low" | "medium" | "high",
  "codeBlocks": [
    {
      "index": <0-based number>,
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

IMPORTANT: "index" must be 0-based (first code block = 0, second = 1, etc.)
Assume this book will be reviewed by a FAANG Staff Engineer. Rewrite any code that would not pass internal production review.
Be thorough. Do not skip small issues. If any code is amateur-level, rewrite it to industry standard.
If the chapter covers data visualization, ensure corrected code includes proper chart examples with labels, titles, and best practices.`;
function extractCodeBlocks(content: string): { code: string; language: string; index: number }[] {
  const blocks: { code: string; language: string; index: number }[] = [];
  const fencedRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  let idx = 0;
  while ((match = fencedRegex.exec(content)) !== null) {
    blocks.push({ code: match[2].trim(), language: match[1] || 'unknown', index: idx++ });
  }
  const structuredRegex = /\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g;
  while ((match = structuredRegex.exec(content)) !== null) {
    blocks.push({ code: match[1].trim(), language: 'structured', index: idx++ });
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
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const codeBlocks = extractCodeBlocks(content);
    
    if (codeBlocks.length === 0) {
      return new Response(JSON.stringify({
        chapterId, chapterTitle, chapterNumber,
        codeBlockCount: 0,
        result: { chapterScore: -1, riskLevel: 'none', codeBlocks: [], overallRecommendations: [], summary: 'No code blocks found in this chapter.' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const codeBlocksText = codeBlocks.map((b, i) => 
      `--- Code Block ${i + 1} (${b.language}) ---\n${b.code}\n`
    ).join('\n');

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('AI API key not configured');

    // Retry with exponential backoff: 8s, 20s, 45s
    let response: Response | null = null;
    const retryDelays = [8000, 20000, 45000];
    
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: STO_AUDIT_PROMPT },
            { role: 'user', content: `Audit the following ${codeBlocks.length} code block(s) from Chapter ${chapterNumber}: "${chapterTitle}".\n\n${codeBlocksText}\n\nReturn ONLY valid JSON matching the specified format.` },
          ],
          temperature: 0.2,
          max_tokens: 6000,
        }),
      });

      if (response.status !== 429 || attempt >= retryDelays.length) break;
      
      const wait = retryDelays[attempt];
      console.log(`Rate limited attempt ${attempt + 1}, waiting ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }

    if (!response || response.status === 429) {
      return new Response(JSON.stringify({ 
        error: 'rate_limited',
        message: 'AI service is busy. The client will retry automatically.',
        retryAfter: 30,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' },
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';
    
    let auditResult;
    
    // --- Robust multi-strategy JSON extraction ---
    function tryParseJSON(raw: string): object | null {
      // Strategy 1: Extract from ```json ... ``` fences
      const jsonFenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/);
      if (jsonFenceMatch) {
        const parsed = cleanAndParse(jsonFenceMatch[1].trim());
        if (parsed) return parsed;
      }
      
      // Strategy 2: Extract from ``` ... ``` (any fence)
      const anyFenceMatch = raw.match(/```\s*\n?([\s\S]*?)```/);
      if (anyFenceMatch) {
        const parsed = cleanAndParse(anyFenceMatch[1].trim());
        if (parsed) return parsed;
      }
      
      // Strategy 3: Find outermost { ... } in raw text
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = cleanAndParse(raw.substring(firstBrace, lastBrace + 1));
        if (parsed) return parsed;
      }
      
      return null;
    }
    
    function cleanAndParse(jsonStr: string): object | null {
      try {
        // Step 1: Remove control chars except whitespace
        let cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // Step 2: Fix trailing commas
        cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
        
        // Step 3: Try direct parse
        return JSON.parse(cleaned);
      } catch {
        try {
          // Step 4: More aggressive cleanup — fix unescaped newlines inside strings
          let fixed = jsonStr
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*\]/g, ']');
          
          // Replace literal newlines inside JSON string values with \\n
          fixed = fixed.replace(/"([^"]*?)"/g, (match) => {
            return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
          });
          
          return JSON.parse(fixed);
        } catch {
          return null;
        }
      }
    }
    
    const parsed = tryParseJSON(rawContent);
    
    if (parsed && typeof parsed === 'object' && 'chapterScore' in parsed) {
      auditResult = parsed;
    } else {
      // Regex-based field extraction as last resort
      const scoreMatch = rawContent.match(/"chapterScore"\s*:\s*(\d+)/);
      const riskMatch = rawContent.match(/"riskLevel"\s*:\s*"(\w+)"/);
      const summaryMatch = rawContent.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      
      // Extract individual issues from the raw text
      const issueMatches = [...rawContent.matchAll(/"issues"\s*:\s*\[([\s\S]*?)\]/g)];
      const extractedIssues: string[] = [];
      for (const m of issueMatches) {
        const inner = m[1];
        const items = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        for (const item of items) {
          extractedIssues.push(item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
        }
      }
      
      // Extract recommendations
      const recMatches = [...rawContent.matchAll(/"(?:overall)?[Rr]ecommendations"\s*:\s*\[([\s\S]*?)\]/g)];
      const extractedRecs: string[] = [];
      for (const m of recMatches) {
        const inner = m[1];
        const items = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        for (const item of items) {
          extractedRecs.push(item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
        }
      }
      
      const summary = summaryMatch 
        ? summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"')
        : 'Audit completed but response format was non-standard. Key issues were still extracted where possible.';
      
      auditResult = {
        chapterScore: scoreMatch ? parseInt(scoreMatch[1]) : 5,
        riskLevel: riskMatch ? riskMatch[1] : 'medium',
        codeBlocks: [],
        overallRecommendations: extractedRecs.length > 0 
          ? extractedRecs.slice(0, 5) 
          : extractedIssues.length > 0
            ? extractedIssues.slice(0, 5)
            : [summary],
        summary,
      };
    }

    return new Response(JSON.stringify({
      chapterId, chapterTitle, chapterNumber, codeBlockCount: codeBlocks.length, result: auditResult,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Audit error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
