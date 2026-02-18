import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============================================================
// AUDIT PROVENANCE — Locked model + prompt version
// ============================================================
const STO_AUDIT_MODEL = "google/gemini-2.5-flash";
const STO_PROMPT_VERSION = "v1.1"; // v1.1: Input normalization + mandatory output enforcement

const log = (step: string, details?: any) => {
  console.log(`[STO-AUDIT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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

CRITICAL JSON RULES:
- Return ONLY a single valid JSON object. No markdown. No backticks. No explanation.
- All string values must have newlines escaped as \\n (two characters: backslash + n).
- All double quotes inside string values must be escaped as \\"
- Do NOT use literal line breaks inside JSON string values.

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
      "correctedCode": "<full corrected code with newlines as \\n>",
      "recommendations": ["<recommendation 1>"]
    }
  ],
  "overallRecommendations": ["<recommendation>"],
  "summary": "<2-3 sentence executive summary>"
}

IMPORTANT: "index" must be 0-based (first code block = 0, second = 1, etc.)
In "correctedCode", use \\n for newlines. Example: "import numpy as np\\nnp.random.seed(42)\\nprint('hello')"
Assume this book will be reviewed by a FAANG Staff Engineer. Rewrite any code that would not pass internal production review.
Be thorough. Do not skip small issues. If any code is amateur-level, rewrite it to industry standard.
If the chapter covers data visualization, ensure corrected code includes proper chart examples with labels, titles, and best practices.

MANDATORY: The "codeBlocks" array MUST contain an entry for EVERY code block audited. Each entry MUST have at least 1 issue and a correctedCode field (even if it's minor style improvements). The "overallRecommendations" array MUST have at least 2 entries. Do NOT return empty arrays.`;

function extractCodeBlocks(content: string): { code: string; language: string; index: number }[] {
  const blocks: { code: string; language: string; index: number }[] = [];
  const fencedRegex = /\`\`\`(\w+)?\s*\n([\s\S]*?)\`\`\`/g;
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

/**
 * Aggressively fix unescaped newlines inside JSON string values.
 */
function fixNewlinesInJsonStrings(raw: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    
    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }
    
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    
    if (inString && ch === '\n') {
      result += '\\n';
      continue;
    }
    if (inString && ch === '\r') {
      result += '\\r';
      continue;
    }
    if (inString && ch === '\t') {
      result += '\\t';
      continue;
    }
    
    result += ch;
  }
  
  return result;
}

function cleanAndParse(jsonStr: string): Record<string, unknown> | null {
  let cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
  
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch { /* continue */ }
  
  try {
    const fixed = fixNewlinesInJsonStrings(cleaned);
    return JSON.parse(fixed) as Record<string, unknown>;
  } catch { /* continue */ }
  
  try {
    const noNewlines = cleaned.replace(/\n/g, '\\n').replace(/\r/g, '');
    return JSON.parse(noNewlines) as Record<string, unknown>;
  } catch { /* continue */ }
  
  return null;
}

function tryParseJSON(raw: string): Record<string, unknown> | null {
  const jsonFenceMatch = raw.match(/```json\s*\n?([\s\S]*?)```/);
  if (jsonFenceMatch) {
    const parsed = cleanAndParse(jsonFenceMatch[1].trim());
    if (parsed) return parsed;
  }
  
  const anyFenceMatch = raw.match(/```\s*\n?([\s\S]*?)```/);
  if (anyFenceMatch) {
    const parsed = cleanAndParse(anyFenceMatch[1].trim());
    if (parsed) return parsed;
  }
  
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const parsed = cleanAndParse(raw.substring(firstBrace, lastBrace + 1));
    if (parsed) return parsed;
  }
  
  const parsed = cleanAndParse(raw.trim());
  if (parsed) return parsed;
  
  return null;
}

/** Extract codeBlocks from raw text via regex when JSON parsing fails */
function extractCodeBlocksFromRaw(raw: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const blockRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"language"\s*:\s*"(\w+)"\s*,[\s\S]*?"correctedCode"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = blockRegex.exec(raw)) !== null) {
    const idx = parseInt(m[1]);
    const lang = m[2];
    const corrected = m[3].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
    
    const blockSection = raw.substring(m.index, raw.indexOf('}', m.index + m[0].length) + 1);
    const issuesMatch = blockSection.match(/"issues"\s*:\s*\[([\s\S]*?)\]/);
    const issues: string[] = [];
    if (issuesMatch) {
      const items = [...issuesMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)];
      for (const item of items) {
        issues.push(item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'));
      }
    }
    
    blocks.push({
      index: idx,
      language: lang,
      originalSnippet: '',
      issues,
      correctedCode: corrected,
      recommendations: [],
    });
  }
  return blocks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auditStartTime = Date.now();

  try {
    const requestBody = await req.json();

    // ============================================================
    // INPUT NORMALIZATION — Defensive defaults for all parameters
    // ============================================================
    const chapterId = (requestBody?.chapterId as string) || '';
    const chapterTitle = (requestBody?.chapterTitle as string) || 'Untitled';
    const chapterNumber = Number(requestBody?.chapterNumber) || 0;
    const content = (requestBody?.content as string) || '';

    // Structured observability logging
    log("Input normalization", {
      hasChapterId: !!chapterId,
      hasContent: !!content,
      contentLength: content.length,
      chapterNumber,
      model: STO_AUDIT_MODEL,
      promptVersion: STO_PROMPT_VERSION,
    });

    if (!content) {
      return new Response(JSON.stringify({ error: 'No content provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const codeBlocks = extractCodeBlocks(content);
    
    log("Code extraction", { codeBlockCount: codeBlocks.length, chapterNumber });

    if (codeBlocks.length === 0) {
      return new Response(JSON.stringify({
        chapterId, chapterTitle, chapterNumber,
        codeBlockCount: 0,
        provenance: { model: STO_AUDIT_MODEL, promptVersion: STO_PROMPT_VERSION },
        result: { chapterScore: -1, riskLevel: 'none', codeBlocks: [], overallRecommendations: [], summary: 'No code blocks found in this chapter.' },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const codeBlocksText = codeBlocks.map((b, i) => 
      `--- Code Block ${i} (${b.language}) ---\n${b.code}\n`
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
          model: STO_AUDIT_MODEL,
          messages: [
            { role: 'system', content: STO_AUDIT_PROMPT },
            { role: 'user', content: `Audit the following ${codeBlocks.length} code block(s) from Chapter ${chapterNumber}: "${chapterTitle}".\n\n${codeBlocksText}\n\nReturn ONLY raw JSON. No markdown fences. Escape all newlines in strings as \\n.` },
          ],
          temperature: 0.1,
          max_tokens: 12000,
        }),
      });

      if (response.status !== 429 || attempt >= retryDelays.length) break;
      
      const wait = retryDelays[attempt];
      log("Rate limited", { attempt: attempt + 1, waitMs: wait });
      await new Promise(r => setTimeout(r, wait));
    }

    if (!response || response.status === 429) {
      log("Rate limit exhausted", { chapterNumber });
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
      log("AI error", { status: response.status, preview: errorText.slice(0, 200) });
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';
    
    log("AI response received", { responseLength: rawContent.length, chapterNumber });
    
    let auditResult;
    let parseStrategy = 'unknown';
    const parsed = tryParseJSON(rawContent);
    
    if (parsed && typeof parsed === 'object' && 'chapterScore' in parsed) {
      auditResult = parsed;
      parseStrategy = 'json';
      log("JSON parsed", { score: parsed.chapterScore, blocks: (parsed.codeBlocks as unknown[])?.length || 0 });
    } else {
      parseStrategy = 'regex_fallback';
      log("JSON parse failed, using regex fallback", { rawPreview: rawContent.slice(0, 200) });
      
      const scoreMatch = rawContent.match(/"chapterScore"\s*:\s*(\d+)/);
      const riskMatch = rawContent.match(/"riskLevel"\s*:\s*"(\w+)"/);
      const summaryMatch = rawContent.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      
      const extractedBlocks = extractCodeBlocksFromRaw(rawContent);
      
      const recMatches = [...rawContent.matchAll(/"(?:overall)?[Rr]ecommendations"\s*:\s*\[([\s\S]*?)\]/g)];
      const extractedRecs: string[] = [];
      for (const m of recMatches) {
        const inner = m[1];
        const items = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        for (const item of items) {
          const rec = item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
          if (rec.length > 5 && rec.length < 500) extractedRecs.push(rec);
        }
      }
      
      const extractedIssues: string[] = [];
      if (extractedRecs.length === 0) {
        const issueMatches = [...rawContent.matchAll(/"issues"\s*:\s*\[([\s\S]*?)\]/g)];
        for (const m of issueMatches) {
          const inner = m[1];
          const items = [...inner.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
          for (const item of items) {
            const issue = item[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
            if (issue.length > 5 && issue.length < 500) extractedIssues.push(issue);
          }
        }
      }
      
      const summary = summaryMatch 
        ? summaryMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"')
        : `Audit reviewed ${codeBlocks.length} code block(s). ${extractedBlocks.length > 0 ? `Found issues in ${extractedBlocks.length} block(s).` : ''} ${extractedRecs.length > 0 ? extractedRecs[0] : 'Review recommendations below.'}`;
      
      auditResult = {
        chapterScore: scoreMatch ? parseInt(scoreMatch[1]) : 5,
        riskLevel: riskMatch ? riskMatch[1] : 'medium',
        codeBlocks: extractedBlocks,
        overallRecommendations: extractedRecs.length > 0 
          ? extractedRecs.slice(0, 8)
          : extractedIssues.length > 0
            ? [...new Set(extractedIssues)].slice(0, 8)
            : [summary],
        summary,
      };
      
      log("Fallback extracted", { score: auditResult.chapterScore, blocks: extractedBlocks.length, recs: auditResult.overallRecommendations.length });
    }

    const durationMs = Date.now() - auditStartTime;

    log("Audit complete", {
      chapterNumber,
      score: auditResult.chapterScore,
      riskLevel: auditResult.riskLevel,
      codeBlocksAudited: codeBlocks.length,
      fixableBlocks: (auditResult.codeBlocks as any[])?.filter((b: any) => b.correctedCode && b.issues?.length > 0).length || 0,
      durationMs,
      parseStrategy,
      model: STO_AUDIT_MODEL,
      promptVersion: STO_PROMPT_VERSION,
    });

    return new Response(JSON.stringify({
      chapterId, chapterTitle, chapterNumber, codeBlockCount: codeBlocks.length,
      provenance: { model: STO_AUDIT_MODEL, promptVersion: STO_PROMPT_VERSION, durationMs, parseStrategy },
      result: auditResult,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    const durationMs = Date.now() - auditStartTime;
    log("ERROR", { message: error.message, durationMs });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
