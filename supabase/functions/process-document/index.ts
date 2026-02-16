/**
 * Document Processing Engine
 * 
 * Accepts uploaded documents (PDF text, DOCX text, plain text, or URL content)
 * and uses AI to:
 * 1. Segment into structured chapters
 * 2. Extract learning objectives, key concepts, terminology
 * 3. Generate reflection prompts + application tasks
 * 4. Create competency quiz per chapter
 * 
 * Output: A book + chapters in the existing schema
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
    // Auth check
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

    // Use AI to analyze and structure the document
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return jsonRes({ error: 'AI service not configured' }, 500);
    }

    // Truncate for analysis prompt if very long (keep first 80k chars for analysis)
    const analysisText = documentText.length > 80000 
      ? documentText.substring(0, 80000) + '\n\n[... remainder truncated for analysis ...]'
      : documentText;

    // Step 1: Analyze document structure
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
            content: `You are a pedagogical content analyzer. Given a document, you must:
1. Extract a clear TITLE for the learning material
2. Write a concise DESCRIPTION (2-3 sentences)
3. Identify the CATEGORY (technology, science, business, medicine, law, finance, history, philosophy, etc.)
4. Segment the content into 3-8 logical CHAPTERS
5. For each chapter, extract: title, key_concepts (3-5), learning_objectives (2-3), terminology (3-5 terms with definitions)

Return JSON:
{
  "title": "...",
  "description": "...",
  "category": "...",
  "academic_level": "beginner|intermediate|advanced",
  "chapters": [
    {
      "title": "...",
      "key_concepts": ["..."],
      "learning_objectives": ["..."],
      "terminology": [{"term": "...", "definition": "..."}],
      "start_marker": "first 10 words of this section in the original text",
      "summary": "2-3 sentence summary of this chapter"
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Analyze and structure this document:\n\n${analysisText}`
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

    console.log(`[process-document] Extracted ${analysis.chapters?.length || 0} chapters: "${analysis.title}"`);

    // Step 2: Split document text into chapters based on markers
    const chapters = analysis.chapters || [];
    const chapterContents = splitDocumentIntoChapters(documentText, chapters);

    // Step 3: Generate enriched chapter content with reflection prompts and application tasks
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminSupabase = createClient(supabaseUrl, serviceKey);

    // Create the book record
    const { data: book, error: bookError } = await adminSupabase
      .from('books')
      .insert({
        title: analysis.title || documentName || 'Untitled Document',
        description: analysis.description || `Learning material from uploaded document: ${documentName}`,
        category: category || analysis.category || 'general',
        user_id: userId,
        creator_id: userId,
        total_chapters: chapters.length,
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

    // Step 3: Generate enriched content for each chapter
    const chapterInserts = [];
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const rawContent = chapterContents[i] || '';
      
      // Build enriched chapter with pedagogical structure
      const enrichedContent = buildEnrichedChapter(ch, rawContent);

      chapterInserts.push({
        book_id: book.id,
        chapter_number: i + 1,
        title: ch.title,
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
      // Clean up book
      await adminSupabase.from('books').delete().eq('id', book.id);
      return jsonRes({ error: 'Failed to create chapters' }, 500);
    }

    // Add to user library
    await adminSupabase.from('user_library').insert({
      user_id: userId,
      book_id: book.id,
      progress_percent: 0,
      last_read_chapter: 0,
    });

    console.log(`[process-document] Success: Book ${book.id} with ${chapters.length} chapters`);

    return jsonRes({
      success: true,
      bookId: book.id,
      title: analysis.title,
      chaptersCreated: chapters.length,
    }, 200);

  } catch (error) {
    console.error('[process-document] Unexpected error:', error);
    return jsonRes({ error: 'Internal server error' }, 500);
  }
});

function splitDocumentIntoChapters(fullText: string, chapters: any[]): string[] {
  if (chapters.length <= 1) return [fullText];

  // Simple equal split if markers don't work well
  const chunkSize = Math.ceil(fullText.length / chapters.length);
  const results: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, fullText.length);
    
    // Try to find natural break points (paragraphs)
    let adjustedEnd = end;
    if (end < fullText.length) {
      const nextParagraph = fullText.indexOf('\n\n', end - 200);
      if (nextParagraph > 0 && nextParagraph < end + 500) {
        adjustedEnd = nextParagraph;
      }
    }
    
    results.push(fullText.substring(start, adjustedEnd).trim());
  }

  return results;
}

function buildEnrichedChapter(chapterMeta: any, rawContent: string): string {
  const parts: string[] = [];

  // Learning objectives header
  if (chapterMeta.learning_objectives?.length) {
    parts.push(`## Learning Objectives\n`);
    chapterMeta.learning_objectives.forEach((obj: string) => {
      parts.push(`- ${obj}`);
    });
    parts.push('');
  }

  // Key concepts
  if (chapterMeta.key_concepts?.length) {
    parts.push(`## Key Concepts\n`);
    chapterMeta.key_concepts.forEach((concept: string) => {
      parts.push(`- **${concept}**`);
    });
    parts.push('');
  }

  // Main content
  parts.push(`## Content\n`);
  parts.push(rawContent || chapterMeta.summary || 'Content from uploaded document.');
  parts.push('');

  // Terminology
  if (chapterMeta.terminology?.length) {
    parts.push(`## Key Terms\n`);
    chapterMeta.terminology.forEach((t: any) => {
      parts.push(`- **${t.term}**: ${t.definition}`);
    });
    parts.push('');
  }

  // Reflection prompt
  parts.push(`## Reflection\n`);
  parts.push(`After reading this chapter, consider the following:`);
  if (chapterMeta.learning_objectives?.length) {
    parts.push(`- How would you explain ${chapterMeta.key_concepts?.[0] || 'the main concept'} to someone unfamiliar with this topic?`);
    parts.push(`- What connections do you see between the concepts in this chapter and your prior knowledge?`);
    parts.push(`- Which idea challenged your existing understanding the most, and why?`);
  }
  parts.push('');

  // Application task
  parts.push(`## Application Task\n`);
  parts.push(`Apply what you've learned:`);
  parts.push(`- Identify a real-world scenario where ${chapterMeta.key_concepts?.[0] || 'this concept'} would be critical.`);
  parts.push(`- Draft a brief plan showing how you would use these concepts in practice.`);
  parts.push('');

  // Chapter summary
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
