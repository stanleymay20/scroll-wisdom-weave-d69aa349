/**
 * Cognitive Assimilation Interface — Knowledge Graph Panel
 * =========================================================
 * 4-Layer knowledge parsing: Map → Assimilate → Compress → Activate
 */

import { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, Network, Zap, BookOpen, HelpCircle, ChevronRight, 
  Loader2, X, Lightbulb, Target, Layers, MessageSquare 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MermaidDiagram } from '@/components/reader/visuals/MermaidDiagram';
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
  type: 'depends_on' | 'extends' | 'contrasts' | 'example_of' | 'part_of' | 'leads_to';
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
  example_of: 'is example of',
  part_of: 'is part of',
  leads_to: 'leads to',
};

const IMPORTANCE_COLORS = [
  'bg-muted/30 text-muted-foreground border-border/50',
  'bg-muted/40 text-foreground/70 border-border',
  'bg-primary/10 text-primary border-primary/30',
  'bg-primary/20 text-primary border-primary/40',
  'bg-primary/30 text-primary font-semibold border-primary/50',
];

const LayerTab = memo(function LayerTab({ 
  icon: Icon, label, active 
}: { 
  icon: typeof Brain; label: string; active?: boolean 
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5", active && "text-primary")} />
      <span className="hidden sm:inline text-xs">{label}</span>
    </div>
  );
});

export function KnowledgeGraphPanel({
  isOpen, onClose, chapterContent, chapterTitle, bookTitle, chapterNumber, bookId,
}: KnowledgeGraphPanelProps) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('map');
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  // Cache key for this chapter
  const cacheKey = `kg-${bookId}-ch${chapterNumber}`;

  const extractGraph = useCallback(async () => {
    if (!chapterContent || chapterContent.length < 50) return;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.concepts?.length > 0) {
          setGraph(parsed);
          return;
        }
      }
    } catch {}

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('extract-knowledge-graph', {
        body: { chapterContent, chapterTitle, bookTitle, chapterNumber },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setGraph(data);
      // Cache
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
    } catch (err: any) {
      const msg = err?.message || 'Failed to extract knowledge graph';
      setError(msg);
      toast({ title: 'Knowledge extraction failed', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, chapterNumber, cacheKey, toast]);

  // Auto-extract when panel opens
  useEffect(() => {
    if (isOpen && !graph && !isLoading) {
      extractGraph();
    }
  }, [isOpen, graph, isLoading, extractGraph]);

  // Reset when chapter changes
  useEffect(() => {
    setGraph(null);
    setExpandedConcept(null);
    setRevealedAnswers(new Set());
  }, [chapterNumber, bookId]);

  const toggleAnswer = (idx: number) => {
    setRevealedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <SheetHeader className="pb-2 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Knowledge Graph
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ch. {chapterNumber}: {chapterTitle}
          </SheetDescription>
        </SheetHeader>

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
        {error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" onClick={extractGraph}>Retry</Button>
          </div>
        )}

        {/* Content */}
        {graph && !isLoading && (
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
                {/* Mermaid Graph */}
                {graph.mermaidGraph && (
                  <div className="bg-muted/20 rounded-xl border border-border/50 p-3">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Concept Network</p>
                    <MermaidDiagram definition={graph.mermaidGraph} className="min-h-[200px]" />
                  </div>
                )}

                {/* Concept List */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {graph.concepts.length} Key Concepts
                  </p>
                  {graph.concepts
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
                              {/* Show relationships */}
                              {graph.relationships
                                .filter(r => r.source === concept.id || r.target === concept.id)
                                .map((rel, i) => {
                                  const other = rel.source === concept.id ? rel.target : rel.source;
                                  const otherConcept = graph.concepts.find(c => c.id === other);
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
              </TabsContent>

              {/* Layer 2: 60-Second Assimilation */}
              <TabsContent value="assimilate" className="mt-0 space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">60-Second Assimilation</span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-line">
                    {graph.summary60s}
                  </div>
                </div>

                {graph.frameworks.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" />
                      Core Frameworks
                    </p>
                    {graph.frameworks.map((fw, i) => (
                      <div key={i} className="bg-card border border-border/50 rounded-lg p-3">
                        <p className="text-sm font-semibold text-foreground">{fw.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{fw.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Layer 3: Concept Compression Cards */}
              <TabsContent value="compress" className="mt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Each concept distilled: Definition → Example → Application
                </p>
                {graph.compressions.map((comp, i) => (
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
                {graph.activeQuestions.map((q, i) => (
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
        {graph && !isLoading && (
          <div className="shrink-0 pt-2 border-t border-border/30">
            <Button variant="ghost" size="sm" onClick={() => { 
              try { localStorage.removeItem(cacheKey); } catch {}
              setGraph(null);
              extractGraph();
            }} className="text-xs w-full">
              Regenerate Knowledge Graph
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
