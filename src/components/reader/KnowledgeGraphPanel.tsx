/**
 * Knowledge Graph Brain — Cognitive Assimilation Interface
 * =========================================================
 * 5-Layer system: Structure → Compress → Connect → Test → Apply
 * Now supports book-level persistent Knowledge Graph Brain
 */

import { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, Network, Zap, BookOpen, HelpCircle, ChevronRight, 
  Loader2, X, Lightbulb, Target, Layers, MessageSquare,
  Globe, Filter, BookMarked, AlertTriangle, TrendingUp, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MermaidDiagram } from '@/components/reader/visuals/MermaidDiagram';
import { useBookKnowledgeGraph, BookConceptNode } from '@/hooks/useBookKnowledgeGraph';
import { cn } from '@/lib/utils';

interface KnowledgeConcept {
  id: string;
  label: string;
  description: string;
  importance: number;
}

interface KnowledgeRelationship {
  source: string;
  target: string;
  type: string;
}

interface Framework {
  name: string;
  description: string;
}

interface ConceptCompression {
  concept: string;
  definition: string;
  example: string;
  application: string;
}

interface KnowledgeGraph {
  concepts: KnowledgeConcept[];
  relationships: KnowledgeRelationship[];
  summary60s: string;
  frameworks: Framework[];
  compressions: ConceptCompression[];
  activeQuestions: string[];
  mermaidGraph: string;
}

interface KnowledgeGraphPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  chapterNumber: number;
  bookId?: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  depends_on: 'depends on',
  extends: 'extends',
  contrasts: 'contrasts with',
  contrasts_with: 'contrasts with',
  example_of: 'is example of',
  part_of: 'is part of',
  leads_to: 'leads to',
  applies_to: 'applies to',
  causes: 'causes',
  supports: 'supports',
};

const IMPORTANCE_COLORS = [
  'bg-muted/30 text-muted-foreground border-border/50',
  'bg-muted/40 text-foreground/70 border-border',
  'bg-primary/10 text-primary border-primary/30',
  'bg-primary/20 text-primary border-primary/40',
  'bg-primary/30 text-primary font-semibold border-primary/50',
];

// ─── Concept Detail Drawer ───
function ConceptDetailDrawer({ 
  node, 
  allNodes, 
  edges, 
  learnerState,
  onClose 
}: { 
  node: BookConceptNode;
  allNodes: BookConceptNode[];
  edges: Array<{ source_node_id: string; target_node_id: string; relationship_type: string }>;
  learnerState?: { mastery_score: number; familiarity_score: number; misconception_flags: string[] };
  onClose: () => void;
}) {
  const relatedEdges = edges.filter(e => e.source_node_id === node.id || e.target_node_id === node.id);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25 }}
      className="absolute inset-0 bg-background z-50 overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base">{node.label}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mastery indicator */}
        {learnerState && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all", 
                  learnerState.mastery_score >= 70 ? "bg-green-500" : 
                  learnerState.mastery_score >= 40 ? "bg-yellow-500" : "bg-destructive"
                )}
                style={{ width: `${learnerState.mastery_score}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{Math.round(learnerState.mastery_score)}% mastery</span>
          </div>
        )}

        {/* Definition */}
        {node.definition && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Definition</p>
            <p className="text-sm leading-relaxed">{node.definition}</p>
          </div>
        )}

        {/* Chapters */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Appears in</p>
          <div className="flex flex-wrap gap-1.5">
            {node.chapters_referenced?.map(ch => (
              <Badge key={ch} variant="outline" className="text-[10px]">
                {ch === node.chapter_first_seen ? `Ch. ${ch} (first)` : `Ch. ${ch}`}
              </Badge>
            ))}
          </div>
        </div>

        {/* Examples */}
        {node.examples?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Examples</p>
            <ul className="space-y-1">
              {node.examples.map((ex, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span> {ex}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Applications */}
        {node.applications?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary font-medium mb-1">Applications</p>
            <ul className="space-y-1">
              {node.applications.map((app, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 text-primary mt-1 shrink-0" /> {app}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Relationships */}
        {relatedEdges.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Connections</p>
            <div className="space-y-1.5">
              {relatedEdges.map((edge, i) => {
                const isSource = edge.source_node_id === node.id;
                const otherId = isSource ? edge.target_node_id : edge.source_node_id;
                const other = allNodes.find(n => n.id === otherId);
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-foreground/70">
                    <span>{isSource ? '→' : '←'}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {RELATIONSHIP_LABELS[edge.relationship_type] || edge.relationship_type}
                    </Badge>
                    <span className="font-medium">{other?.label || 'Unknown'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Misconceptions */}
        {learnerState?.misconception_flags?.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Misconceptions
            </p>
            {learnerState.misconception_flags.map((flag, i) => (
              <p key={i} className="text-xs text-destructive/80">{flag}</p>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function KnowledgeGraphPanel({
  isOpen, onClose, chapterContent, chapterTitle, bookTitle, chapterNumber, bookId,
}: KnowledgeGraphPanelProps) {
  const [chapterGraph, setChapterGraph] = useState<KnowledgeGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('map');
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<'chapter' | 'book'>('chapter');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { toast } = useToast();

  // Book-level graph hook
  const bookGraph = useBookKnowledgeGraph(bookId);

  const cacheKey = `kg-${bookId}-ch${chapterNumber}`;

  const extractGraph = useCallback(async () => {
    if (!chapterContent || chapterContent.length < 50) return;

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.concepts?.length > 0) {
          setChapterGraph(parsed);
          // Auto-merge to book graph if we have bookId
          if (bookId && parsed.concepts) {
            bookGraph.mergeChapterGraph(chapterNumber, parsed.concepts, parsed.relationships, parsed.mermaidGraph);
          }
          return;
        }
      }
    } catch {}

    setIsLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;

      const { data, error: fnError } = await supabase.functions.invoke('extract-knowledge-graph', {
        body: { chapterContent, chapterTitle, bookTitle, chapterNumber },
        headers,
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setChapterGraph(data);
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}

      // Auto-merge to book-level graph
      if (bookId && data.concepts) {
        bookGraph.mergeChapterGraph(chapterNumber, data.concepts, data.relationships, data.mermaidGraph);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to extract knowledge graph';
      setError(msg);
      toast({ title: 'Knowledge extraction failed', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, chapterNumber, cacheKey, toast, bookId]);

  // Auto-extract when panel opens
  useEffect(() => {
    if (isOpen && !chapterGraph && !isLoading) {
      extractGraph();
    }
  }, [isOpen, chapterGraph, isLoading, extractGraph]);

  useEffect(() => {
    if (isOpen && !chapterGraph && bookGraph.hasGraph) {
      setViewMode('book');
    }
  }, [isOpen, chapterGraph, bookGraph.hasGraph]);

  // Reset on chapter change
  useEffect(() => {
    setChapterGraph(null);
    setExpandedConcept(null);
    setRevealedAnswers(new Set());
    setSelectedNodeId(null);
  }, [chapterNumber, bookId]);

  const toggleAnswer = (idx: number) => {
    setRevealedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Book-level nodes, optionally filtered by chapter
  const bookNodes = viewMode === 'book' ? bookGraph.nodes : bookGraph.getNodesForChapter(chapterNumber);
  const bookMermaid = bookGraph.generateBookMermaid();
  const weakConcepts = bookGraph.getWeakConcepts();

  const selectedNode = selectedNodeId ? bookGraph.nodes.find(n => n.id === selectedNodeId) : null;
  const selectedLearnerState = selectedNodeId ? bookGraph.learnerStates.find(s => s.concept_node_id === selectedNodeId) : undefined;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col relative">
        <SheetHeader className="pb-2 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Knowledge Graph Brain
            {bookGraph.hasGraph && (
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {bookGraph.nodes.length} concepts · {bookGraph.edges.length} links
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs flex items-center gap-2">
            <span>Ch. {chapterNumber}: {chapterTitle}</span>
            {bookGraph.meta && (
              <span className="text-muted-foreground">
                · {bookGraph.meta.chapters_indexed?.length || 0} chapters indexed
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* View Mode Toggle */}
        {bookGraph.hasGraph && (
          <div className="flex gap-1 shrink-0 mb-2">
            <Button
              size="sm"
              variant={viewMode === 'chapter' ? 'default' : 'outline'}
              className="text-xs h-7 flex-1"
              onClick={() => setViewMode('chapter')}
            >
              <Filter className="h-3 w-3 mr-1" /> This Chapter
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'book' ? 'default' : 'outline'}
              className="text-xs h-7 flex-1"
              onClick={() => setViewMode('book')}
            >
              <Globe className="h-3 w-3 mr-1" /> Entire Book
            </Button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <div className="relative">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <Brain className="h-5 w-5 text-primary/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Extracting knowledge structure…</p>
              <p className="text-xs text-muted-foreground mt-1">AI is parsing concepts, relationships &amp; frameworks</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && !chapterGraph && !bookGraph.hasGraph && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" onClick={extractGraph}>Retry</Button>
          </div>
        )}

        {/* Main Content */}
        {(chapterGraph || bookGraph.hasGraph) && !isLoading && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-4 shrink-0 mb-3">
              <TabsTrigger value="map" className="text-xs gap-1">
                <Network className="h-3.5 w-3.5" /> Map
              </TabsTrigger>
              <TabsTrigger value="assimilate" className="text-xs gap-1">
                <Zap className="h-3.5 w-3.5" /> 60s
              </TabsTrigger>
              <TabsTrigger value="compress" className="text-xs gap-1">
                <Layers className="h-3.5 w-3.5" /> Cards
              </TabsTrigger>
              <TabsTrigger value="activate" className="text-xs gap-1">
                <Target className="h-3.5 w-3.5" /> Think
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto pb-6">
              {/* Layer 1: Knowledge Map */}
              <TabsContent value="map" className="mt-0 space-y-4">
                {/* Weak concepts alert */}
                {weakConcepts.length > 0 && viewMode === 'book' && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-destructive">
                        {weakConcepts.length} weak concept{weakConcepts.length > 1 ? 's' : ''} need review
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {weakConcepts.slice(0, 5).map(c => (
                          <Badge key={c.id} variant="outline" className="text-[10px] text-destructive border-destructive/30 cursor-pointer"
                            onClick={() => setSelectedNodeId(c.id)}>
                            {c.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Graph visualization */}
                {viewMode === 'book' && bookMermaid ? (
                  <div className="bg-muted/20 rounded-xl border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" /> Book-Level Concept Network
                    </p>
                    <MermaidDiagram definition={bookMermaid} className="min-h-[200px]" />
                  </div>
                ) : chapterGraph?.mermaidGraph ? (
                  <div className="bg-muted/20 rounded-xl border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Chapter Concept Network</p>
                    <MermaidDiagram definition={chapterGraph.mermaidGraph} className="min-h-[200px]" />
                  </div>
                ) : null}

                {/* Concept List — book-level nodes */}
                {viewMode === 'book' && bookNodes.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {bookNodes.length} Concepts {viewMode === 'book' ? '(All Chapters)' : `(Chapter ${chapterNumber})`}
                    </p>
                    {bookNodes.map((node) => (
                      <motion.button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className={cn(
                          "w-full text-left rounded-lg border p-3 transition-all",
                          IMPORTANCE_COLORS[Math.min((node.importance || 3) - 1, 4)],
                        )}
                        layout
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{node.label}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px] py-0">
                              Ch. {node.chapters_referenced?.join(', ')}
                            </Badge>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        {node.definition && (
                          <p className="text-xs mt-1 opacity-70 line-clamp-1">{node.definition}</p>
                        )}
                      </motion.button>
                    ))}
                  </div>
                ) : chapterGraph?.concepts ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {chapterGraph.concepts.length} Key Concepts
                    </p>
                    {chapterGraph.concepts
                      .sort((a, b) => b.importance - a.importance)
                      .map((concept) => (
                        <motion.button
                          key={concept.id}
                          onClick={() => setExpandedConcept(expandedConcept === concept.id ? null : concept.id)}
                          className={cn(
                            "w-full text-left rounded-lg border p-3 transition-all",
                            IMPORTANCE_COLORS[Math.min(concept.importance - 1, 4)],
                            expandedConcept === concept.id && "ring-1 ring-primary"
                          )}
                          layout
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{concept.label}</span>
                            <div className="flex items-center gap-1.5">
                              {Array.from({ length: concept.importance }, (_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />
                              ))}
                              <ChevronRight className={cn(
                                "h-3.5 w-3.5 transition-transform ml-1",
                                expandedConcept === concept.id && "rotate-90"
                              )} />
                            </div>
                          </div>
                          <AnimatePresence>
                            {expandedConcept === concept.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <p className="text-xs mt-2 opacity-80 leading-relaxed">{concept.description}</p>
                                {chapterGraph.relationships
                                  .filter(r => r.source === concept.id || r.target === concept.id)
                                  .map((rel, i) => {
                                    const other = rel.source === concept.id ? rel.target : rel.source;
                                    const otherConcept = chapterGraph.concepts.find(c => c.id === other);
                                    const direction = rel.source === concept.id ? '→' : '←';
                                    return (
                                      <div key={i} className="flex items-center gap-1.5 mt-1.5 text-[11px] opacity-60">
                                        <span>{direction}</span>
                                        <Badge variant="outline" className="text-[10px] py-0">
                                          {RELATIONSHIP_LABELS[rel.type] || rel.type}
                                        </Badge>
                                        <span>{otherConcept?.label || other}</span>
                                      </div>
                                    );
                                  })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      ))}
                  </div>
                ) : null}
              </TabsContent>

              {/* Layer 2: 60-Second Assimilation */}
              <TabsContent value="assimilate" className="mt-0 space-y-4">
                {chapterGraph && (
                  <>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">60-Second Assimilation</span>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-line">
                        {chapterGraph.summary60s}
                      </div>
                    </div>

                    {chapterGraph.frameworks.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5" />
                          Core Frameworks
                        </p>
                        {chapterGraph.frameworks.map((fw, i) => (
                          <div key={i} className="bg-card border border-border/50 rounded-lg p-3">
                            <p className="text-sm font-semibold text-foreground">{fw.name}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{fw.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Book-level stats when in book mode */}
                {viewMode === 'book' && bookGraph.meta && (
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      Book Intelligence Summary
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-background rounded-lg p-2">
                        <p className="text-lg font-bold text-primary">{bookGraph.nodes.length}</p>
                        <p className="text-[10px] text-muted-foreground">Concepts</p>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <p className="text-lg font-bold text-primary">{bookGraph.edges.length}</p>
                        <p className="text-[10px] text-muted-foreground">Links</p>
                      </div>
                      <div className="bg-background rounded-lg p-2">
                        <p className="text-lg font-bold text-primary">{bookGraph.meta.chapters_indexed?.length || 0}</p>
                        <p className="text-[10px] text-muted-foreground">Indexed</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Layer 3: Concept Compression Cards */}
              <TabsContent value="compress" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Each concept distilled: Definition → Example → Application
                </p>
                {chapterGraph?.compressions.map((comp, i) => (
                  <div key={i} className="bg-card border border-border/50 rounded-xl overflow-hidden">
                    <div className="bg-primary/10 px-4 py-2 border-b border-border/30">
                      <span className="text-sm font-semibold">{comp.concept}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Definition</p>
                        <p className="text-sm leading-relaxed">{comp.definition}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Example</p>
                        <p className="text-sm leading-relaxed text-foreground/80">{comp.example}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-primary font-medium mb-0.5">Application</p>
                        <p className="text-sm leading-relaxed text-foreground/80">{comp.application}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* Layer 4: Active Cognition */}
              <TabsContent value="activate" className="mt-0 space-y-3">
                <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-2">
                  <p className="text-xs text-foreground/70 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Answer these to lock knowledge into memory
                  </p>
                </div>
                {chapterGraph?.activeQuestions.map((q, i) => (
                  <div key={i} className="bg-card border border-border/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium leading-relaxed">{q}</p>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="mt-2 text-xs h-7"
                          onClick={() => toggleAnswer(i)}
                        >
                          {revealedAnswers.has(i) ? 'I\'ve reflected ✓' : 'Think about it…'}
                        </Button>
                        {revealedAnswers.has(i) && (
                          <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs text-muted-foreground mt-1 italic"
                          >
                            ✓ Reflected — this strengthens neural pathways for this concept
                          </motion.p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </div>
          </Tabs>
        )}

        {/* Refresh button */}
        {(chapterGraph || bookGraph.hasGraph) && !isLoading && (
          <div className="shrink-0 pt-2 border-t border-border/30">
            <Button variant="ghost" size="sm" onClick={() => { 
              try { localStorage.removeItem(cacheKey); } catch {}
              setChapterGraph(null);
              extractGraph();
            }} className="text-xs w-full">
              Regenerate Knowledge Graph
            </Button>
          </div>
        )}

        {/* Concept Detail Drawer */}
        <AnimatePresence>
          {selectedNode && (
            <ConceptDetailDrawer
              node={selectedNode}
              allNodes={bookGraph.nodes}
              edges={bookGraph.edges}
              learnerState={selectedLearnerState}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
