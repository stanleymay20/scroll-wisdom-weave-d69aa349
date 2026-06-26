import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chapterContent, chapterTitle, bookTitle, chapterNumber } = await req.json();

    if (!chapterContent || chapterContent.length < 50) {
      return new Response(JSON.stringify({ error: 'Insufficient chapter content' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Truncate content to ~8000 chars to stay within token limits
    const truncated = chapterContent.slice(0, 8000);

    const systemPrompt = `You are a knowledge extraction engine. Given a book chapter, extract a structured cognitive map.

Return a JSON object using tool calling with these fields:

1. "concepts" — array of {id, label, description, importance} where importance is 1-5
2. "relationships" — array of {source, target, type} where source/target are concept ids, type is one of: "depends_on", "extends", "contrasts", "example_of", "part_of", "leads_to"
3. "summary60s" — A 60-second assimilation summary: 3-5 key ideas the reader must know before reading, written as crisp bullet points
4. "frameworks" — array of {name, description} — core models/frameworks taught
5. "compressions" — array of {concept, definition, example, application} — one per major concept
6. "activeQuestions" — array of 3-5 thought-provoking questions that force active cognition (comparisons, scenario analysis, concept linking)
7. "mermaidGraph" — a valid Mermaid graph TD definition showing concept relationships (max 15 nodes, use short labels)

Extract 5-12 concepts. Be precise and domain-specific, not generic.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Book: "${bookTitle}"\nChapter ${chapterNumber}: "${chapterTitle}"\n\nContent:\n${truncated}` },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_knowledge_graph',
              description: 'Extract structured knowledge graph from chapter content',
              parameters: {
                type: 'object',
                properties: {
                  concepts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        label: { type: 'string' },
                        description: { type: 'string' },
                        importance: { type: 'number' },
                      },
                      required: ['id', 'label', 'description', 'importance'],
                      additionalProperties: false,
                    },
                  },
                  relationships: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        source: { type: 'string' },
                        target: { type: 'string' },
                        type: { type: 'string', enum: ['depends_on', 'extends', 'contrasts', 'example_of', 'part_of', 'leads_to'] },
                      },
                      required: ['source', 'target', 'type'],
                      additionalProperties: false,
                    },
                  },
                  summary60s: { type: 'string' },
                  frameworks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['name', 'description'],
                      additionalProperties: false,
                    },
                  },
                  compressions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        concept: { type: 'string' },
                        definition: { type: 'string' },
                        example: { type: 'string' },
                        application: { type: 'string' },
                      },
                      required: ['concept', 'definition', 'example', 'application'],
                      additionalProperties: false,
                    },
                  },
                  activeQuestions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  mermaidGraph: { type: 'string' },
                },
                required: ['concepts', 'relationships', 'summary60s', 'frameworks', 'compressions', 'activeQuestions', 'mermaidGraph'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'extract_knowledge_graph' } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again shortly.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error('No structured output from AI');
    }

    const knowledgeGraph = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(knowledgeGraph), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('extract-knowledge-graph error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
