import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ConceptInput {
  id: string;
  label: string;
  description: string;
  importance: number;
  examples?: string[];
  applications?: string[];
}

interface RelationshipInput {
  source: string;
  target: string;
  type: string;
}

interface ChapterGraphInput {
  bookId: string;
  chapterNumber: number;
  concepts: ConceptInput[];
  relationships: RelationshipInput[];
  mermaidGraph?: string;
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user from JWT using getClaims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { bookId, chapterNumber, concepts, relationships, mermaidGraph } = await req.json() as ChapterGraphInput;

    if (!bookId || !concepts?.length) {
      return new Response(JSON.stringify({ error: 'bookId and concepts are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify book ownership
    const { data: book } = await supabase.from('books').select('id, user_id').eq('id', bookId).single();
    if (!book || book.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Book not found or not owned' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map from chapter concept IDs to DB node IDs
    const conceptIdMap = new Map<string, string>();

    // Upsert concept nodes
    for (const concept of concepts) {
      const normalized = normalizeLabel(concept.label);
      
      // Check if node already exists
      const { data: existing } = await supabase
        .from('concept_nodes')
        .select('id, chapters_referenced, examples, applications, importance')
        .eq('book_id', bookId)
        .eq('normalized_label', normalized)
        .maybeSingle();

      if (existing) {
        // Merge: add chapter, merge examples/applications, update importance
        const chaptersRef = Array.from(new Set([...(existing.chapters_referenced || []), chapterNumber]));
        const examples = Array.from(new Set([...(existing.examples || []), ...(concept.examples || [])])).slice(0, 10);
        const applications = Array.from(new Set([...(existing.applications || []), ...(concept.applications || [])])).slice(0, 10);
        const importance = Math.max(existing.importance || 3, concept.importance);

        await supabase
          .from('concept_nodes')
          .update({
            chapters_referenced: chaptersRef,
            examples,
            applications,
            importance,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        conceptIdMap.set(concept.id, existing.id);
      } else {
        // Insert new node
        const { data: newNode, error: insertErr } = await supabase
          .from('concept_nodes')
          .insert({
            book_id: bookId,
            label: concept.label,
            normalized_label: normalized,
            definition: concept.description,
            chapter_first_seen: chapterNumber,
            chapters_referenced: [chapterNumber],
            examples: concept.examples || [],
            applications: concept.applications || [],
            difficulty: 3,
            importance: concept.importance,
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Insert concept error:', insertErr);
          continue;
        }
        conceptIdMap.set(concept.id, newNode.id);
      }
    }

    // Upsert edges
    for (const rel of relationships) {
      const sourceId = conceptIdMap.get(rel.source);
      const targetId = conceptIdMap.get(rel.target);
      if (!sourceId || !targetId) continue;

      await supabase
        .from('concept_edges')
        .upsert({
          book_id: bookId,
          source_node_id: sourceId,
          target_node_id: targetId,
          relationship_type: rel.type,
          chapter_introduced: chapterNumber,
        }, {
          onConflict: 'book_id,source_node_id,target_node_id,relationship_type',
        });
    }

    // Update book graph metadata
    const { data: allNodes } = await supabase
      .from('concept_nodes')
      .select('id')
      .eq('book_id', bookId);

    const { data: allEdges } = await supabase
      .from('concept_edges')
      .select('id')
      .eq('book_id', bookId);

    const { data: existingGraph } = await supabase
      .from('book_knowledge_graphs')
      .select('id, chapters_indexed')
      .eq('book_id', bookId)
      .maybeSingle();

    const chaptersIndexed = Array.from(new Set([
      ...(existingGraph?.chapters_indexed || []),
      chapterNumber,
    ])).sort((a, b) => a - b);

    if (existingGraph) {
      await supabase
        .from('book_knowledge_graphs')
        .update({
          total_nodes: allNodes?.length || 0,
          total_edges: allEdges?.length || 0,
          chapters_indexed: chaptersIndexed,
          mermaid_graph: mermaidGraph || null,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', existingGraph.id);
    } else {
      await supabase
        .from('book_knowledge_graphs')
        .insert({
          book_id: bookId,
          total_nodes: allNodes?.length || 0,
          total_edges: allEdges?.length || 0,
          chapters_indexed: chaptersIndexed,
          mermaid_graph: mermaidGraph || null,
        });
    }

    return new Response(JSON.stringify({
      success: true,
      nodesTotal: allNodes?.length || 0,
      edgesTotal: allEdges?.length || 0,
      chaptersIndexed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('merge-book-graph error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
