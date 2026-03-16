import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BookConceptNode {
  id: string;
  book_id: string;
  label: string;
  normalized_label: string;
  definition: string | null;
  chapter_first_seen: number;
  chapters_referenced: number[];
  examples: string[];
  applications: string[];
  difficulty: number;
  importance: number;
}

export interface BookConceptEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  chapter_introduced: number | null;
  weight: number;
}

export interface BookGraphMeta {
  id: string;
  book_id: string;
  total_nodes: number;
  total_edges: number;
  chapters_indexed: number[];
  mermaid_graph: string | null;
  last_updated_at: string;
}

export interface LearnerConceptState {
  id: string;
  concept_node_id: string;
  familiarity_score: number;
  mastery_score: number;
  misconception_flags: string[];
  application_confidence: number;
  times_reviewed: number;
}

export function useBookKnowledgeGraph(bookId: string | undefined) {
  const [nodes, setNodes] = useState<BookConceptNode[]>([]);
  const [edges, setEdges] = useState<BookConceptEdge[]>([]);
  const [meta, setMeta] = useState<BookGraphMeta | null>(null);
  const [learnerStates, setLearnerStates] = useState<LearnerConceptState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGraph, setHasGraph] = useState(false);
  const { toast } = useToast();

  const fetchGraph = useCallback(async () => {
    if (!bookId) return;
    setIsLoading(true);
    try {
      // Fetch all in parallel
      const [nodesRes, edgesRes, metaRes] = await Promise.all([
        supabase.from('concept_nodes').select('*').eq('book_id', bookId).order('importance', { ascending: false }),
        supabase.from('concept_edges').select('*').eq('book_id', bookId),
        supabase.from('book_knowledge_graphs').select('*').eq('book_id', bookId).maybeSingle(),
      ]);

      const fetchedNodes = (nodesRes.data || []) as unknown as BookConceptNode[];
      const fetchedEdges = (edgesRes.data || []) as unknown as BookConceptEdge[];
      const fetchedMeta = metaRes.data as unknown as BookGraphMeta | null;

      setNodes(fetchedNodes);
      setEdges(fetchedEdges);
      setMeta(fetchedMeta);
      setHasGraph(fetchedNodes.length > 0);

      // Fetch learner states if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      if (user && fetchedNodes.length > 0) {
        const nodeIds = fetchedNodes.map(n => n.id);
        const { data: states } = await supabase
          .from('learner_concept_states')
          .select('*')
          .eq('user_id', user.id)
          .in('concept_node_id', nodeIds);
        setLearnerStates((states || []) as unknown as LearnerConceptState[]);
      }
    } catch (err) {
      console.error('Failed to fetch book knowledge graph:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const mergeChapterGraph = useCallback(async (
    chapterNumber: number,
    concepts: Array<{ id: string; label: string; description: string; importance: number }>,
    relationships: Array<{ source: string; target: string; type: string }>,
    mermaidGraph?: string
  ) => {
    if (!bookId) return;
    try {
      // Ensure user is authenticated before calling
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('merge-book-graph skipped: no active session');
        return;
      }
      const { data, error } = await supabase.functions.invoke('merge-book-graph', {
        body: { bookId, chapterNumber, concepts, relationships, mermaidGraph },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      // Refresh
      await fetchGraph();
      return data;
    } catch (err: any) {
      console.error('Failed to merge chapter graph:', err);
      toast({ title: 'Graph merge failed', description: err?.message, variant: 'destructive' });
    }
  }, [bookId, fetchGraph, toast]);

  const updateLearnerState = useCallback(async (conceptNodeId: string, updates: Partial<LearnerConceptState>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('learner_concept_states')
      .upsert({
        user_id: user.id,
        concept_node_id: conceptNodeId,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,concept_node_id' });

    await fetchGraph();
  }, [fetchGraph]);

  // Get nodes filtered by chapter
  const getNodesForChapter = useCallback((chapterNumber: number) => {
    return nodes.filter(n => n.chapters_referenced?.includes(chapterNumber));
  }, [nodes]);

  // Get weak concepts (mastery < 50%)
  const getWeakConcepts = useCallback(() => {
    return nodes.filter(node => {
      const state = learnerStates.find(s => s.concept_node_id === node.id);
      return state && state.mastery_score < 50;
    });
  }, [nodes, learnerStates]);

  // Get prerequisite chain for a concept
  const getPrerequisites = useCallback((nodeId: string): BookConceptNode[] => {
    const prereqEdges = edges.filter(e => e.target_node_id === nodeId && e.relationship_type === 'depends_on');
    return prereqEdges.map(e => nodes.find(n => n.id === e.source_node_id)).filter(Boolean) as BookConceptNode[];
  }, [edges, nodes]);

  // Generate book-level mermaid from stored nodes/edges
  const generateBookMermaid = useCallback(() => {
    if (nodes.length === 0) return '';
    const lines = ['graph TD'];
    const top = nodes.slice(0, 20);
    const nodeIds = new Set(top.map(n => n.id));
    
    for (const node of top) {
      const shortLabel = node.label.length > 25 ? node.label.slice(0, 22) + '...' : node.label;
      lines.push(`  ${node.normalized_label}["${shortLabel}"]`);
    }
    
    for (const edge of edges) {
      if (!nodeIds.has(edge.source_node_id) || !nodeIds.has(edge.target_node_id)) continue;
      const src = nodes.find(n => n.id === edge.source_node_id);
      const tgt = nodes.find(n => n.id === edge.target_node_id);
      if (!src || !tgt) continue;
      const arrow = edge.relationship_type === 'contrasts_with' ? '-.->' : '-->';
      const label = edge.relationship_type.replace(/_/g, ' ');
      lines.push(`  ${src.normalized_label} ${arrow}|${label}| ${tgt.normalized_label}`);
    }
    
    return lines.join('\n');
  }, [nodes, edges]);

  return {
    nodes,
    edges,
    meta,
    learnerStates,
    isLoading,
    hasGraph,
    fetchGraph,
    mergeChapterGraph,
    updateLearnerState,
    getNodesForChapter,
    getWeakConcepts,
    getPrerequisites,
    generateBookMermaid,
  };
}
