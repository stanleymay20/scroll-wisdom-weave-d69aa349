/**
 * Document Processing Engine v2
 * 
 * Improved pipeline:
 * 1. Strip front matter (praise pages, copyright, TOC)
 * 2. Detect real chapter boundaries via heading patterns
 * 3. Multi-pass AI analysis for large documents
 * 4. Enrich each chapter with pedagogical structure
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonRes({ error: 'Unauthorized' }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { documentText, documentName, sourceType, category, language } = body;

    if (!documentText || documentText.trim().length < 200) {
      return jsonRes({ error: 'Document must contain at least 200 characters of text.' }, 400);
    }

    if (documentText.length > 2000000) {
      return jsonRes({ error: 'Document exceeds maximum size (approx. 2M characters).' }, 400);
    }

    console.log(`[process-document] Processing for user ${userId}, source: ${sourceType}, length: ${documentText.length}`);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return jsonRes({ error: 'AI service not configured' }, 500);
    }

    // Step 1: Strip front matter
    const cleanedText = stripFrontMatter(documentText);
    console.log(`[process-document] After stripping front matter: ${cleanedText.length} chars (removed ${documentText.length - cleanedText.length})`);

    // Step 2: Detect chapter boundaries using heading patterns
    const detectedChapters = detectChapterBoundaries(cleanedText);
    console.log(`[process-document] Detected ${detectedChapters.length} chapters from headings`);

    // Step 3: AI analysis - use multi-pass for large documents
    const analysisText = buildAnalysisText(cleanedText, detectedChapters);
    
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a pedagogical content analyzer. You are given a document with pre-detected chapter boundaries.

Your job:
1. Extract a clear TITLE for the book
2. Write a concise DESCRIPTION (2-3 sentences)
3. Identify the CATEGORY
4. For each chapter provided, extract: key_concepts (3-5), learning_objectives (2-3), terminology (3-5 terms with definitions), summary (2-3 sentences)

IMPORTANT: Keep the exact chapter titles and order as provided. Do NOT merge or skip chapters.

Return JSON:
{
  "title": "...",
  "description": "...",
  "category": "...",
  "academic_level": "beginner|intermediate|advanced",
  "chapters": [
    {
      "title": "exact chapter title as provided",
      "key_concepts": ["..."],
      "learning_objectives": ["..."],
      "terminology": [{"term": "...", "definition": "..."}],
      "summary": "..."
    }
  ]
}`
          },
          {
            role: 'user',
            content: analysisText
          }
        ],
      }),
    });

    if (!analysisResponse.ok) {
      console.error('[process-document] Analysis API error:', analysisResponse.status);
      return jsonRes({ error: 'Failed to analyze document' }, 500);
    }

    const analysisData = await analysisResponse.json();
    const analysis = JSON.parse(analysisData.choices[0].message.content);

    console.log(`[process-document] AI returned ${analysis.chapters?.length || 0} chapters: "${analysis.title}"`);

    // Step 4: Create book and chapters
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, serviceKey);

    const { data: book, error: bookError } = await adminSupabase
      .from('books')
      .insert({
        title: analysis.title || documentName || 'Untitled Document',
        description: analysis.description || `Learning material from: ${documentName}`,
        category: category || analysis.category || 'general',
        user_id: userId,
        creator_id: userId,
        total_chapters: detectedChapters.length,
        book_type: 'text',
        academic_level: analysis.academic_level || 'intermediate',
        language: language || 'en',
        source_type: sourceType || 'uploaded',
        source_document_name: documentName,
        is_published: false,
      })
      .select('id')
      .single();

    if (bookError) {
      console.error('[process-document] Book creation error:', bookError);
      return jsonRes({ error: 'Failed to create book record' }, 500);
    }

    // Build chapter inserts using detected boundaries + AI metadata
    const chapterInserts = [];
    for (let i = 0; i < detectedChapters.length; i++) {
      const detected = detectedChapters[i];
      const aiMeta = analysis.chapters?.[i] || { 
        key_concepts: [], learning_objectives: [], terminology: [], summary: '' 
      };

      const enrichedContent = buildEnrichedChapter(aiMeta, detected.content);

      chapterInserts.push({
        book_id: book.id,
        chapter_number: i + 1,
        title: detected.title,
        content: enrichedContent,
        is_generated: true,
        word_count: enrichedContent.split(/\s+/).length,
        academic_mode: true,
      });
    }

    const { error: chaptersError } = await adminSupabase
      .from('chapters')
      .insert(chapterInserts);

    if (chaptersError) {
      console.error('[process-document] Chapters insert error:', chaptersError);
      await adminSupabase.from('books').delete().eq('id', book.id);
      return jsonRes({ error: 'Failed to create chapters' }, 500);
    }

    await adminSupabase.from('user_library').insert({
      user_id: userId,
      book_id: book.id,
      progress_percent: 0,
      last_read_chapter: 0,
    });

    console.log(`[process-document] Success: Book ${book.id} with ${detectedChapters.length} chapters`);

    return jsonRes({
      success: true,
      bookId: book.id,
      title: analysis.title,
      chaptersCreated: detectedChapters.length,
    }, 200);

  } catch (error) {
    console.error('[process-document] Unexpected error:', error);
    return jsonRes({ error: 'Internal server error' }, 500);
  }
});

/**
 * Strip front matter: praise pages, copyright, TOC, preface metadata
 */
function stripFrontMatter(text: string): string {
  // Common front matter markers to find the start of real content
  const contentStartPatterns = [
    /(?:^|\n)(?:Chapter\s+1|CHAPTER\s+1|Part\s+I\b|PART\s+I\b)/m,
    /(?:^|\n)#{1,3}\s*(?:Chapter\s+1|Part\s+I)/im,
    /(?:^|\n)(?:1\.\s+[A-Z])/m, // "1. Chapter Title"
  ];

  // Try to find where real content starts
  for (const pattern of contentStartPatterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && match.index > 500) {
      // Found a content start marker after significant front matter
      console.log(`[strip-front-matter] Found content start at position ${match.index} via pattern`);
      return text.substring(match.index).trim();
    }
  }

  // Fallback: try to detect end of TOC / copyright block
  // Look for patterns like "ISBN:", "All rights reserved", table of contents dots
  const tocEndPatterns = [
    /(?:Additional Resources|Conclusion|Index)\s*\.{3,}\s*\d+\s*\n/g,
    /\[LSI\]/g,
    /ISBN:\s*[\d-]+/g,
  ];

  let lastFrontMatterEnd = 0;
  for (const pattern of tocEndPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const end = match.index + match[0].length;
      if (end > lastFrontMatterEnd && end < text.length * 0.3) {
        lastFrontMatterEnd = end;
      }
    }
  }

  if (lastFrontMatterEnd > 500) {
    console.log(`[strip-front-matter] Stripping front matter up to position ${lastFrontMatterEnd}`);
    return text.substring(lastFrontMatterEnd).trim();
  }

  // If nothing detected, strip first 200 chars of potential cover text at most
  return text;
}

/**
 * Detect chapter boundaries using heading patterns in the text
 */
function detectChapterBoundaries(text: string): Array<{ title: string; content: string }> {
  // Patterns that indicate chapter/section headings (ordered by specificity)
  const headingPatterns = [
    // "Chapter N. Title" or "Chapter N: Title"
    /(?:^|\n)\s*(?:Chapter|CHAPTER)\s+(\d+)[.:]\s*(.+?)(?:\n|$)/gm,
    // "Part N. Title"
    /(?:^|\n)\s*(?:Part|PART)\s+([IVXLCDM]+|\d+)[.:]?\s*(.+?)(?:\n|$)/gm,
    // Numbered sections like "1. Title" or "2. Title" (at line start, title-cased)
    /(?:^|\n)\s*(\d{1,2})\.\s+([A-Z][A-Za-z\s,':&-]{5,80})(?:\n|$)/gm,
  ];

  interface HeadingMatch {
    index: number;
    title: string;
    fullMatch: string;
  }

  const headings: HeadingMatch[] = [];

  // Try each pattern, use the one that finds the most reasonable matches
  for (const pattern of headingPatterns) {
    const matches: HeadingMatch[] = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const title = match[2]?.trim() || match[0].trim();
      // Filter out false positives: too short, or looks like a list item / sentence
      if (title.length < 3 || title.length > 120) continue;
      // Skip if title contains too many lowercase words (likely a sentence)
      const words = title.split(/\s+/);
      if (words.length > 10) continue;
      
      matches.push({
        index: match.index,
        title: title.replace(/\s+/g, ' '),
        fullMatch: match[0],
      });
    }

    if (matches.length >= 3 && matches.length <= 40) {
      headings.push(...matches);
      console.log(`[detect-chapters] Found ${matches.length} headings with pattern: ${pattern.source.substring(0, 40)}...`);
      break; // Use first pattern that works well
    }
  }

  // If no heading patterns work, try markdown-style headings
  if (headings.length < 3) {
    const mdPattern = /(?:^|\n)#{1,2}\s+(.+?)(?:\n|$)/gm;
    let match;
    const mdHeadings: HeadingMatch[] = [];
    while ((match = mdPattern.exec(text)) !== null) {
      const title = match[1]?.trim();
      if (!title || title.length < 3 || title.length > 120) continue;
      // Skip TOC-like entries with dots
      if (title.includes('...')) continue;
      mdHeadings.push({ index: match.index, title, fullMatch: match[0] });
    }
    if (mdHeadings.length >= 3) {
      headings.push(...mdHeadings);
      console.log(`[detect-chapters] Found ${mdHeadings.length} markdown headings`);
    }
  }

  // If still no headings found, fall back to equal split
  if (headings.length < 2) {
    console.log('[detect-chapters] No chapter boundaries found, using paragraph-based split');
    return fallbackSplit(text);
  }

  // Sort by position and extract content between headings
  headings.sort((a, b) => a.index - b.index);

  // Deduplicate headings that are very close together
  const deduped: HeadingMatch[] = [];
  for (const h of headings) {
    if (deduped.length === 0 || h.index - deduped[deduped.length - 1].index > 200) {
      deduped.push(h);
    }
  }

  const chapters: Array<{ title: string; content: string }> = [];
  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index + deduped[i].fullMatch.length;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    const content = text.substring(start, end).trim();
    
    // Skip chapters with very little content (likely sub-headings or artifacts)
    if (content.length < 200) continue;
    
    chapters.push({
      title: deduped[i].title,
      content,
    });
  }

  // If we ended up with too many tiny chapters, merge small ones
  if (chapters.length > 25) {
    return mergeSmallChapters(chapters, 15);
  }

  return chapters.length >= 2 ? chapters : fallbackSplit(text);
}

/**
 * Merge small consecutive chapters to reach a target count
 */
function mergeSmallChapters(chapters: Array<{ title: string; content: string }>, targetMax: number): Array<{ title: string; content: string }> {
  if (chapters.length <= targetMax) return chapters;
  
  // Sort by content length, merge the smallest ones with their neighbors
  const result = [...chapters];
  while (result.length > targetMax) {
    let smallestIdx = 0;
    let smallestLen = Infinity;
    for (let i = 0; i < result.length; i++) {
      if (result[i].content.length < smallestLen) {
        smallestLen = result[i].content.length;
        smallestIdx = i;
      }
    }
    // Merge with next chapter (or previous if last)
    const mergeWith = smallestIdx < result.length - 1 ? smallestIdx + 1 : smallestIdx - 1;
    if (mergeWith < 0) break;
    
    const [first, second] = smallestIdx < mergeWith 
      ? [smallestIdx, mergeWith] 
      : [mergeWith, smallestIdx];
    
    result[first] = {
      title: result[first].title,
      content: result[first].content + '\n\n' + result[second].content,
    };
    result.splice(second, 1);
  }
  return result;
}

/**
 * Fallback: split by paragraph clusters into ~5-8 chapters
 */
function fallbackSplit(text: string, targetChapters = 6): Array<{ title: string; content: string }> {
  const chunkSize = Math.ceil(text.length / targetChapters);
  const results: Array<{ title: string; content: string }> = [];

  for (let i = 0; i < targetChapters; i++) {
    const start = i * chunkSize;
    let end = Math.min((i + 1) * chunkSize, text.length);
    
    // Find natural break point
    if (end < text.length) {
      const nextBreak = text.indexOf('\n\n', end - 300);
      if (nextBreak > 0 && nextBreak < end + 500) {
        end = nextBreak;
      }
    }
    
    const content = text.substring(start, end).trim();
    if (content.length < 100) continue;
    
    // Extract a title from the first meaningful line
    const firstLine = content.split('\n').find(l => l.trim().length > 5 && l.trim().length < 100);
    results.push({
      title: firstLine?.trim().replace(/^#+\s*/, '') || `Section ${i + 1}`,
      content,
    });
  }

  return results;
}

/**
 * Build analysis text for AI - includes chapter titles + samples from each chapter
 */
function buildAnalysisText(fullText: string, chapters: Array<{ title: string; content: string }>): string {
  const parts: string[] = [];
  parts.push(`Document with ${chapters.length} detected chapters:\n`);
  
  // Budget: ~120K chars total for analysis, distributed across chapters
  const perChapterBudget = Math.min(
    Math.floor(120000 / chapters.length),
    20000
  );

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const sample = ch.content.length > perChapterBudget
      ? ch.content.substring(0, perChapterBudget) + '\n[... truncated ...]'
      : ch.content;
    
    parts.push(`\n--- CHAPTER ${i + 1}: "${ch.title}" ---`);
    parts.push(sample);
  }

  return parts.join('\n');
}

function buildEnrichedChapter(chapterMeta: any, rawContent: string): string {
  const parts: string[] = [];

  if (chapterMeta.learning_objectives?.length) {
    parts.push(`## Learning Objectives\n`);
    chapterMeta.learning_objectives.forEach((obj: string) => parts.push(`- ${obj}`));
    parts.push('');
  }

  if (chapterMeta.key_concepts?.length) {
    parts.push(`## Key Concepts\n`);
    chapterMeta.key_concepts.forEach((c: string) => parts.push(`- **${c}**`));
    parts.push('');
  }

  parts.push(`## Content\n`);
  parts.push(rawContent || chapterMeta.summary || 'Content from uploaded document.');
  parts.push('');

  if (chapterMeta.terminology?.length) {
    parts.push(`## Key Terms\n`);
    chapterMeta.terminology.forEach((t: any) => parts.push(`- **${t.term}**: ${t.definition}`));
    parts.push('');
  }

  parts.push(`## Reflection\n`);
  parts.push(`After reading this chapter, consider the following:`);
  parts.push(`- How would you explain ${chapterMeta.key_concepts?.[0] || 'the main concept'} to someone unfamiliar with this topic?`);
  parts.push(`- What connections do you see between the concepts in this chapter and your prior knowledge?`);
  parts.push(`- Which idea challenged your existing understanding the most, and why?`);
  parts.push('');

  parts.push(`## Application Task\n`);
  parts.push(`Apply what you've learned:`);
  parts.push(`- Identify a real-world scenario where ${chapterMeta.key_concepts?.[0] || 'this concept'} would be critical.`);
  parts.push(`- Draft a brief plan showing how you would use these concepts in practice.`);
  parts.push('');

  if (chapterMeta.summary) {
    parts.push(`## Summary\n`);
    parts.push(chapterMeta.summary);
  }

  return parts.join('\n');
}

function jsonRes(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
