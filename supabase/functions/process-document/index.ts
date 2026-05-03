/**
 * Document Processing Engine v3
 * 
 * Pipeline:
 * 1. Authenticate user via getUser (reliable JWT validation)
 * 2. Normalize PDF text (fix mid-line chapter markers)
 * 3. Strip front matter (praise pages, copyright, TOC)
 * 4. Detect real chapter boundaries via heading patterns
 * 5. AI analysis via Lovable AI gateway (no API key required)
 * 6. Enrich each chapter with pedagogical structure
 * 7. Create book + chapters in database
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, preflight, requireUser, enforceRateLimit, json as httpJson } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const userId = auth.userId;

    // Per-user rate limit: 10 uploads / 10 min — protects AI gateway and DB.
    const limited = enforceRateLimit({
      name: 'process-document',
      key: userId,
      limit: 10,
      windowSec: 600,
    });
    if (limited) return limited;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonRes({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, 400);
    }
    const { documentText, documentName, sourceType, category, language } = body ?? {};

    // Strict server-side validation (defence in depth — never trust the client)
    if (typeof documentText !== 'string' || documentText.trim().length < 200) {
      return jsonRes(
        { error: 'Document must contain at least 200 characters of text.', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    if (documentText.length > 2_000_000) {
      return jsonRes(
        { error: 'Document exceeds maximum size (approx. 2M characters).', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    if (documentName && (typeof documentName !== 'string' || documentName.length > 500)) {
      return jsonRes({ error: 'Invalid document name.', code: 'VALIDATION_ERROR' }, 400);
    }
    const allowedSourceTypes = ['uploaded', 'pasted', 'url'];
    const safeSourceType = allowedSourceTypes.includes(sourceType) ? sourceType : 'uploaded';
    const safeLanguage = typeof language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(language) ? language : 'en';

    console.log(`[process-document] Processing for user ${userId.slice(0, 8)}..., source: ${safeSourceType}, length: ${documentText.length}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonRes({ error: 'AI service not configured', code: 'SERVICE_UNAVAILABLE' }, 500);
    }

    // Dedup: hash the input text + user; reject identical re-uploads within 24h.
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const contentHash = await sha256(`${userId}|${documentText.length}|${documentText.slice(0, 4000)}|${documentText.slice(-2000)}`);
    const { data: dupBook } = await adminSupabase
      .from('books')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .eq('source_content_hash', contentHash)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();
    if (dupBook?.id) {
      console.log(`[process-document] Duplicate upload detected, returning existing book ${dupBook.id}`);
      return jsonRes({
        success: true,
        bookId: dupBook.id,
        title: dupBook.title,
        chaptersCreated: 0,
        deduplicated: true,
      }, 200);
    }

    // Step 0: Normalize PDF text — insert newlines before chapter/part markers
    const normalizedText = normalizePdfText(documentText);

    // Step 1: Strip front matter
    const cleanedText = stripFrontMatter(normalizedText);
    console.log(`[process-document] After stripping front matter: ${cleanedText.length} chars (removed ${normalizedText.length - cleanedText.length})`);

    // Step 2: Detect chapter boundaries using heading patterns
    const detectedChapters = detectChapterBoundaries(cleanedText);
    console.log(`[process-document] Detected ${detectedChapters.length} chapters from headings`);

    // Step 3: AI analysis via Lovable AI gateway
    const analysisText = buildAnalysisText(cleanedText, detectedChapters);
    
    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a pedagogical content analyzer. You are given a document with pre-detected chapter boundaries.

Your job:
1. Extract a clear TITLE for the book (the actual book title, not a description)
2. Write a concise DESCRIPTION (2-3 sentences about what the book covers)
3. Identify the CATEGORY (one of: technology, science, medicine, law, economics, finance, governance, history, philosophy, theology, self_help, business, general)
4. For each chapter provided, extract:
   - title: a CLEAN, human-readable chapter title (max 8 words). The provided titles may contain PDF extraction artifacts (run-on words, leading "CHAPTER N", body text bleed). Rewrite the title cleanly based on the chapter content — do NOT echo artifacts. Strip leading "Chapter N:" prefixes. Capitalize as Title Case.
   - key_concepts (3-5), learning_objectives (2-3 measurable), terminology (3-5 terms with definitions), summary (2-3 sentences)

IMPORTANT:
- Preserve the chapter ORDER and COUNT exactly as provided. One output chapter per input chapter.
- Do NOT merge or skip chapters.
- The book title must be the actual book title (e.g. "The Hundred-Page Machine Learning Book"), not a description.

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "category": "...",
  "academic_level": "beginner|intermediate|advanced",
  "chapters": [
    {
      "title": "Clean chapter title",
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
      const errText = await analysisResponse.text();
      console.error('[process-document] Analysis API error:', analysisResponse.status, errText.slice(0, 300));
      // Surface AI-credit exhaustion / rate limits clearly.
      if (analysisResponse.status === 402) {
        return jsonRes({ error: 'AI credits exhausted. Please add credits or try again later.', code: 'AI_CREDITS_EXHAUSTED' }, 402);
      }
      if (analysisResponse.status === 429) {
        return jsonRes({ error: 'AI service is busy. Please try again in a minute.', code: 'RATE_LIMITED' }, 429);
      }
      return jsonRes({ error: 'Failed to analyze document', code: 'GENERATION_FAILED' }, 502);
    }

    const analysisData = await analysisResponse.json();
    const rawContent = analysisData.choices?.[0]?.message?.content || '';
    
    // Safe JSON parse — handle markdown code fences
    let analysis: any;
    try {
      const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Try extracting JSON from the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { analysis = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
      if (!analysis) {
        console.error('[process-document] Failed to parse AI response:', rawContent.slice(0, 500));
        // Fallback: create minimal analysis
        analysis = {
          title: documentName || 'Uploaded Document',
          description: `Learning material processed from: ${documentName}`,
          category: category || 'general',
          academic_level: 'intermediate',
          chapters: detectedChapters.map(ch => ({
            title: ch.title,
            key_concepts: [],
            learning_objectives: [],
            terminology: [],
            summary: '',
          })),
        };
      }
    }

    console.log(`[process-document] AI returned ${analysis.chapters?.length || 0} chapters: "${analysis.title}"`);

    // Step 4: Create book and chapters (adminSupabase already created above)
    const isPdfUpload = safeSourceType === 'uploaded' && typeof documentName === 'string' && documentName.toLowerCase().endsWith('.pdf');
    const computedBookType = isPdfUpload ? 'uploaded_pdf' : (safeSourceType === 'url' ? 'web_article' : 'text');

    const bookInsert: Record<string, unknown> = {
      title: (analysis.title || documentName || 'Untitled Document').toString().slice(0, 500),
      description: (analysis.description || `Learning material from: ${documentName ?? 'document'}`).toString().slice(0, 2000),
      category: (category || analysis.category || 'general').toString().slice(0, 100),
      user_id: userId,
      creator_id: userId,
      total_chapters: detectedChapters.length,
      book_type: computedBookType,
      academic_level: analysis.academic_level || 'intermediate',
      language: safeLanguage,
      source_type: safeSourceType,
      source_document_name: documentName ?? null,
      source_content_hash: contentHash,
      is_published: false,
    };

    const { data: book, error: bookError } = await adminSupabase
      .from('books')
      .insert(bookInsert)
      .select('id')
      .single();

    if (bookError) {
      console.error('[process-document] Book creation error:', bookError);
      // If the column source_content_hash doesn't exist yet, retry without it.
      if (/source_content_hash/.test(bookError.message ?? '')) {
        delete bookInsert.source_content_hash;
        const retry = await adminSupabase.from('books').insert(bookInsert).select('id').single();
        if (retry.error) {
          return jsonRes({ error: 'Failed to create book record', code: 'CONFLICT' }, 500);
        }
        (book as any) = retry.data;
      } else {
        return jsonRes({ error: 'Failed to create book record', code: 'CONFLICT' }, 500);
      }
    }

    console.log(`[process-document] Source type: ${safeSourceType}, isPdfUpload: ${isPdfUpload}`);

    // Postgres text columns reject \u0000 (NUL). Strip them and other control chars.
    const stripNul = (s: string) => (typeof s === 'string' ? s.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') : s);

    const chapterInserts = [];
    for (let i = 0; i < detectedChapters.length; i++) {
      const detected = detectedChapters[i];
      const aiMeta = analysis.chapters?.[i] || {
        key_concepts: [], learning_objectives: [], terminology: [], summary: ''
      };

      const chapterMetadata = {
        learning_objectives: aiMeta.learning_objectives || [],
        key_concepts: aiMeta.key_concepts || [],
        terminology: aiMeta.terminology || [],
        summary: aiMeta.summary || '',
      };

      const chapterContent = isPdfUpload
        ? detected.content
        : buildEnrichedChapter(detected.title, aiMeta, detected.content);

      const safeContent = stripNul(chapterContent);
      const safeTitle = stripNul(detected.title);

      chapterInserts.push({
        book_id: (book as any).id,
        chapter_number: i + 1,
        title: safeTitle,
        content: safeContent,
        is_generated: !isPdfUpload,
        word_count: safeContent.split(/\s+/).length,
        academic_mode: true,
        research_metadata: chapterMetadata,
      });
    }

    const { error: chaptersError } = await adminSupabase
      .from('chapters')
      .insert(chapterInserts);

    if (chaptersError) {
      console.error('[process-document] Chapters insert error:', chaptersError);
      await adminSupabase.from('books').delete().eq('id', (book as any).id);
      return jsonRes({ error: 'Failed to create chapters', code: 'GENERATION_PARTIAL' }, 500);
    }

    await adminSupabase.from('user_library').insert({
      user_id: userId,
      book_id: (book as any).id,
      progress_percent: 0,
      last_read_chapter: 0,
    });

    console.log(`[process-document] Success: Book ${(book as any).id} with ${detectedChapters.length} chapters`);

    return jsonRes({
      success: true,
      bookId: (book as any).id,
      title: analysis.title,
      chaptersCreated: detectedChapters.length,
    }, 200);

  } catch (error) {
    console.error('[process-document] Unexpected error:', error);
    return jsonRes({ error: 'Internal server error', code: 'UNKNOWN' }, 500);
  }
});

// =========================================================
// TEXT NORMALIZATION
// =========================================================

/**
 * Normalize PDF text: insert newlines before chapter/part markers
 * and restore paragraph breaks from PDF extraction artifacts.
 */
function normalizePdfText(text: string): string {
  // Insert newline before "CHAPTER N" anywhere it appears without a preceding newline
  text = text.replace(/(?<!\n)\s*(CHAPTER\s+\d+)/gi, '\n\n$1');
  // Same for PART markers
  text = text.replace(/(?<!\n)\s*(PART\s+[IVXLCDM]+\b)/gi, '\n\n$1');
  
  // PDF extraction often joins paragraphs with single spaces.
  // Detect sentence-ending period followed by uppercase start (paragraph boundary)
  text = text.replace(/([.!?])\s{2,}([A-Z])/g, '$1\n\n$2');
  
  // Clean up excessive newlines
  text = text.replace(/\n{4,}/g, '\n\n\n');
  return text;
}

// =========================================================
// FRONT MATTER STRIPPING
// =========================================================

function stripFrontMatter(text: string): string {
  const contentStartPatterns = [
    /(?:^|\n)(?:Chapter\s+1|CHAPTER\s+1)/m,
    /(?:^|\n)#{1,3}\s*(?:Chapter\s+1)/im,
    /(?:^|\n)(?:1\.\s+[A-Z])/m,
    /(?:^|\n)(?:Part\s+I\b|PART\s+I\b)/m,
    /(?:^|\n)#{1,3}\s*(?:Part\s+I)/im,
  ];

  for (const pattern of contentStartPatterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && match.index > 300) {
      console.log(`[strip-front-matter] Found content start at position ${match.index}`);
      return text.substring(match.index).trim();
    }
  }

  // Fallback: strip known front matter blocks inline
  let cleaned = text;
  const frontMatterPatterns = [
    /(?:^|\n).*(?:All rights reserved|ISBN[:\s]|©\s*\d{4}|TABLE OF CONTENTS).*(?:\n|$)/gi,
    /(?:^|\n).*(?:Scroll Publishing Code|Published by ScrollLibrary|ScrollAuthorGPT).*(?:\n|$)/gi,
  ];
  for (const pattern of frontMatterPatterns) {
    cleaned = cleaned.replace(pattern, '\n');
  }

  // TOC-end detection
  const tocEndPatterns = [
    /(?:Additional Resources|Conclusion|Index)\s*\.{3,}\s*\d+\s*\n/g,
    /\[LSI\]/g,
    /ISBN:\s*[\d-]+/g,
  ];

  let lastFrontMatterEnd = 0;
  for (const pattern of tocEndPatterns) {
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      const end = match.index + match[0].length;
      if (end > lastFrontMatterEnd && end < cleaned.length * 0.3) {
        lastFrontMatterEnd = end;
      }
    }
  }

  if (lastFrontMatterEnd > 500) {
    return cleaned.substring(lastFrontMatterEnd).trim();
  }

  return cleaned;
}

// =========================================================
// CHAPTER BOUNDARY DETECTION
// =========================================================

function detectChapterBoundaries(text: string): Array<{ title: string; content: string }> {
  const headingPatterns = [
    // "CHAPTER N  Title..." or "Chapter N: Title" or "Chapter N. Title"
    /(?:^|\n)\s*((?:Chapter|CHAPTER)\s+\d+\s*[.:]?\s*[^\n]{0,120})(?:\n|$)/gm,
    // "PART I  Title" or "Part 1: Title"
    /(?:^|\n)\s*((?:Part|PART)\s+(?:[IVXLCDM]+|\d+)\s*[.:]?\s*[^\n]{0,120})(?:\n|$)/gm,
    // Numbered sections like "1. Title" (must start with capital, be short)
    /(?:^|\n)\s*(\d{1,2}\.\s+[A-Z][A-Za-z\s,':&-]{5,80})(?:\n|$)/gm,
  ];

  interface HeadingMatch {
    index: number;
    title: string;
    fullMatch: string;
  }

  // Try each pattern, collect all candidates and pick the best one
  const candidates: { matches: HeadingMatch[]; patternIdx: number }[] = [];
  
  for (let pi = 0; pi < headingPatterns.length; pi++) {
    const pattern = headingPatterns[pi];
    const matches: HeadingMatch[] = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rawLine = match[1]?.trim() || match[0].trim();
      
      // Extract clean title from the heading line
      const title = extractCleanTitle(rawLine);
      
      if (!title || title.length < 3 || title.length > 120) continue;
      const words = title.split(/\s+/);
      if (words.length > 15) continue;
      
      // Skip lines that look like prose (>8 words with common stop words)
      const stopWords = ['the', 'and', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 'are', 'was', 'for'];
      const lowerWords = words.map(w => w.toLowerCase());
      const stopCount = lowerWords.filter(w => stopWords.includes(w)).length;
      if (words.length > 8 && stopCount >= 3) continue;
      
      matches.push({
        index: match.index,
        title,
        fullMatch: match[0],
      });
    }

    if (matches.length >= 2 && matches.length <= 60) {
      candidates.push({ matches, patternIdx: pi });
      console.log(`[detect-chapters] Pattern ${pi} found ${matches.length} headings`);
    }
  }

  // Pick the candidate with the most headings (prefer chapters over parts)
  const headings: HeadingMatch[] = [];
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.matches.length - a.matches.length);
    const best = candidates[0];
    headings.push(...best.matches);
    console.log(`[detect-chapters] Selected pattern ${best.patternIdx} with ${best.matches.length} headings`);
  }

  // If no heading patterns work, try markdown-style headings
  if (headings.length < 3) {
    const mdPattern = /(?:^|\n)#{1,2}\s+(.+?)(?:\n|$)/gm;
    let match;
    const mdHeadings: HeadingMatch[] = [];
    while ((match = mdPattern.exec(text)) !== null) {
      const title = match[1]?.trim();
      if (!title || title.length < 3 || title.length > 120) continue;
      if (title.includes('...')) continue;
      mdHeadings.push({ index: match.index, title, fullMatch: match[0] });
    }
    if (mdHeadings.length >= 3) {
      headings.length = 0;
      headings.push(...mdHeadings);
      console.log(`[detect-chapters] Found ${mdHeadings.length} markdown headings`);
    }
  }

  // If still no headings found, fall back to equal split
  if (headings.length < 2) {
    console.log('[detect-chapters] No chapter boundaries found, using paragraph-based split');
    return fallbackSplit(text);
  }

  // Sort by position and deduplicate
  headings.sort((a, b) => a.index - b.index);

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
  
  // If a single chapter has >80% of total content, re-split it
  const totalLen = chapters.reduce((s, c) => s + c.content.length, 0);
  const oversized = chapters.find(c => c.content.length > totalLen * 0.6 && chapters.length > 1);
  if (oversized && totalLen > 10000) {
    console.log(`[detect-chapters] Chapter "${oversized.title}" has ${Math.round(oversized.content.length / totalLen * 100)}% of content — re-splitting`);
    const subChapters = fallbackSplit(oversized.content, Math.min(8, Math.ceil(oversized.content.length / 8000)));
    const idx = chapters.indexOf(oversized);
    chapters.splice(idx, 1, ...subChapters);
  }

  return chapters.length >= 2 ? chapters : fallbackSplit(text);
}

/**
 * Extract a clean title from a raw heading line.
 * Handles: "CHAPTER 5  Data Engineering Described  If you work in..." -> "Data Engineering Described"
 */
function extractCleanTitle(rawLine: string): string {
  // Remove "Chapter N" / "CHAPTER N" / "Part I" prefix
  let title = rawLine.replace(/^(?:Chapter|CHAPTER)\s+\d+\s*[.:]?\s*/i, '');
  title = title.replace(/^(?:Part|PART)\s+(?:[IVXLCDM]+|\d+)\s*[.:]?\s*/i, '');
  
  // If the remaining text has double-spaces (PDF artifact), take only the first segment
  // "Data Engineering Described  If you work in data" -> "Data Engineering Described"
  const doubleSpaceParts = title.split(/\s{2,}/);
  if (doubleSpaceParts.length >= 2 && doubleSpaceParts[0].length >= 5) {
    title = doubleSpaceParts[0];
  }
  
  // Clean trailing punctuation artifacts
  title = title.replace(/[,;:\s]+$/, '').trim();
  
  // If title is still empty, use the raw line
  if (!title || title.length < 3) {
    title = rawLine.replace(/\s{2,}/g, ' ').trim();
  }
  
  return title.replace(/\s+/g, ' ');
}

function mergeSmallChapters(chapters: Array<{ title: string; content: string }>, targetMax: number): Array<{ title: string; content: string }> {
  if (chapters.length <= targetMax) return chapters;
  
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

function fallbackSplit(text: string, targetChapters = 6): Array<{ title: string; content: string }> {
  const chunkSize = Math.ceil(text.length / targetChapters);
  const results: Array<{ title: string; content: string }> = [];

  for (let i = 0; i < targetChapters; i++) {
    const start = i * chunkSize;
    let end = Math.min((i + 1) * chunkSize, text.length);
    
    // Find natural break point (paragraph boundary)
    if (end < text.length) {
      const nextBreak = text.indexOf('\n\n', end - 300);
      if (nextBreak > 0 && nextBreak < end + 500) {
        end = nextBreak;
      }
    }
    
    const content = text.substring(start, end).trim();
    if (content.length < 100) continue;
    
    // Extract a title from the first meaningful line
    const firstLine = content.split('\n').find(l => {
      const trimmed = l.trim();
      return trimmed.length > 5 && trimmed.length < 100 && !trimmed.startsWith('>');
    });
    results.push({
      title: firstLine?.trim().replace(/^#+\s*/, '').replace(/^[\d.]+\s*/, '') || `Section ${i + 1}`,
      content,
    });
  }

  return results;
}

// =========================================================
// AI ANALYSIS TEXT BUILDER
// =========================================================

function buildAnalysisText(fullText: string, chapters: Array<{ title: string; content: string }>): string {
  const parts: string[] = [];
  parts.push(`Document with ${chapters.length} detected chapters:\n`);
  
  // Budget: ~100K chars total, distributed across chapters
  const perChapterBudget = Math.min(
    Math.floor(100000 / chapters.length),
    15000
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

// =========================================================
// CHAPTER ENRICHMENT
// =========================================================

function buildEnrichedChapter(chapterTitle: string, chapterMeta: any, rawContent: string): string {
  const parts: string[] = [];

  // Add chapter title as main heading
  parts.push(`# ${chapterTitle}\n`);

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

  // Clean orphan figure/table references from extracted text
  let cleanedContent = rawContent || chapterMeta.summary || 'Content from uploaded document.';
  cleanedContent = stripOrphanFigureRefs(cleanedContent);

  parts.push(`---\n`);
  parts.push(cleanedContent);
  parts.push('');

  if (chapterMeta.terminology?.length) {
    parts.push(`---\n`);
    parts.push(`## Key Terms\n`);
    chapterMeta.terminology.forEach((t: any) => {
      if (t && t.term) {
        parts.push(`- **${t.term}**: ${t.definition || 'See chapter content.'}`);
      }
    });
    parts.push('');
  }

  if (chapterMeta.summary) {
    parts.push(`## Summary\n`);
    parts.push(chapterMeta.summary);
  }

  return parts.join('\n');
}

function stripOrphanFigureRefs(text: string): string {
  // Replace standalone figure/table caption lines
  text = text.replace(
    /(?:^|\n)\s*(?:Figure|Fig\.?|Table|Exhibit)\s+[\d.]+[.:]\s*[^\n]{0,120}(?:\n|$)/gi,
    (match) => {
      const caption = match.trim();
      return `\n\n> 📎 *${caption}* — *(Visual from original document, not available in text format)*\n\n`;
    }
  );

  // Replace inline references
  text = text.replace(
    /(?:as\s+(?:shown|illustrated|depicted|seen)\s+in\s+)?(?:\(?\s*(?:see\s+)?(?:Figure|Fig\.?|Table|Exhibit)\s+[\d.]+\s*\)?)/gi,
    (match) => `*[${match.trim()} — original document]*`
  );

  return text;
}

function jsonRes(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
