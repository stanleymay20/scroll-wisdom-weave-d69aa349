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
  Globe, Filter, BookMarked, AlertTriangle, TrendingUp, ArrowRight,
  Eye, Send, Award, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MermaidDiagram } from '@/components/reader/visuals/MermaidDiagram';
import { InteractiveMindMap } from '@/components/reader/mindmap';
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

// ─── Unified Concept Detail Drawer ───
// Works for both book-level BookConceptNode AND chapter-level KnowledgeConcept
interface ConceptDetail {
  id: string;
  label: string;
  definition?: string | null;
  chapters_referenced?: number[];
  chapter_first_seen?: number;
  examples?: string[];
  applications?: string[];
  importance?: number;
  difficulty?: number;
}

function ConceptDetailDrawer({ 
  concept, 
  allConcepts,
  bookEdges,
  chapterRelationships,
  learnerState,
  onClose,
  onNavigateConcept,
}: { 
  concept: ConceptDetail;
  allConcepts: ConceptDetail[];
  bookEdges: Array<{ source_node_id: string; target_node_id: string; relationship_type: string }>;
  chapterRelationships?: KnowledgeRelationship[];
  learnerState?: { mastery_score: number; familiarity_score: number; misconception_flags: string[] };
  onClose: () => void;
  onNavigateConcept?: (id: string) => void;
}) {
  // Collect edges from book-level or chapter-level data
  const relatedEdges = bookEdges.filter(e => e.source_node_id === concept.id || e.target_node_id === concept.id);
  const chapterRels = chapterRelationships?.filter(r => r.source === concept.id || r.target === concept.id) || [];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25 }}
      className="absolute inset-0 bg-background z-50 overflow-y-auto"
    >
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight">{concept.label}</h3>
            {concept.importance && (
              <div className="flex items-center gap-1 mt-1.5">
                {Array.from({ length: concept.importance }, (_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-primary" />
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">
                  Importance {concept.importance}/5
                </span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mastery indicator */}
        {learnerState && (
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Your Mastery
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all", 
                    learnerState.mastery_score >= 70 ? "bg-primary" : 
                    learnerState.mastery_score >= 40 ? "bg-accent-foreground/60" : "bg-destructive"
                  )}
                  style={{ width: `${learnerState.mastery_score}%` }}
                />
              </div>
              <span className="text-sm font-semibold">{Math.round(learnerState.mastery_score)}%</span>
            </div>
          </div>
        )}

        {/* Definition */}
        {concept.definition && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Definition
            </p>
            <p className="text-sm leading-relaxed">{concept.definition}</p>
          </div>
        )}

        {/* Chapters */}
        {concept.chapters_referenced && concept.chapters_referenced.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <BookMarked className="h-3 w-3" /> Appears in Chapters
            </p>
            <div className="flex flex-wrap gap-1.5">
              {concept.chapters_referenced.map(ch => (
                <Badge key={ch} variant={ch === concept.chapter_first_seen ? 'default' : 'outline'} className="text-xs">
                  Ch. {ch}{ch === concept.chapter_first_seen ? ' (introduced)' : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Examples */}
        {concept.examples && concept.examples.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Examples
            </p>
            <ul className="space-y-2">
              {concept.examples.map((ex, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 bg-muted/20 rounded-lg p-3">
                  <span className="text-primary font-bold mt-0.5">{i + 1}</span>
                  <span className="leading-relaxed">{ex}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Applications */}
        {concept.applications && concept.applications.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5 flex items-center gap-1">
              <Target className="h-3 w-3" /> Real-World Applications
            </p>
            <ul className="space-y-2">
              {concept.applications.map((app, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{app}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Connections — book edges */}
        {relatedEdges.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <Network className="h-3 w-3" /> Connected Concepts
            </p>
            <div className="space-y-2">
              {relatedEdges.map((edge, i) => {
                const isSource = edge.source_node_id === concept.id;
                const otherId = isSource ? edge.target_node_id : edge.source_node_id;
                const other = allConcepts.find(n => n.id === otherId);
                return (
                  <button
                    key={i}
                    onClick={() => other && onNavigateConcept?.(other.id)}
                    className="w-full flex items-center gap-2 text-xs text-foreground/70 bg-muted/20 rounded-lg p-2.5 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="text-primary font-bold">{isSource ? '→' : '←'}</span>
                    <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                      {RELATIONSHIP_LABELS[edge.relationship_type] || edge.relationship_type}
                    </Badge>
                    <span className="font-medium truncate">{other?.label || 'Unknown'}</span>
                    <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-40" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Connections — chapter relationships (fallback) */}
        {relatedEdges.length === 0 && chapterRels.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <Network className="h-3 w-3" /> Connected Concepts
            </p>
            <div className="space-y-2">
              {chapterRels.map((rel, i) => {
                const isSource = rel.source === concept.id;
                const otherId = isSource ? rel.target : rel.source;
                const other = allConcepts.find(c => c.id === otherId);
                return (
                  <button
                    key={i}
                    onClick={() => other && onNavigateConcept?.(other.id)}
                    className="w-full flex items-center gap-2 text-xs text-foreground/70 bg-muted/20 rounded-lg p-2.5 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="text-primary font-bold">{isSource ? '→' : '←'}</span>
                    <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                      {RELATIONSHIP_LABELS[rel.type] || rel.type}
                    </Badge>
                    <span className="font-medium truncate">{other?.label || otherId}</span>
                    <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-40" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Misconceptions */}
        {learnerState?.misconception_flags?.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Misconceptions to Address
            </p>
            {learnerState.misconception_flags.map((flag, i) => (
              <p key={i} className="text-xs text-destructive/80 mt-1">{flag}</p>
            ))}
          </div>
        )}

        {/* Difficulty badge */}
        {concept.difficulty && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span>Difficulty:</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={cn("w-3 h-1.5 rounded-full", i < concept.difficulty! ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
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
  const [thinkAnswers, setThinkAnswers] = useState<Record<number, string>>({});
  const [thinkGrades, setThinkGrades] = useState<Record<number, number>>({});
  const [thinkFeedback, setThinkFeedback] = useState<Record<number, string>>({});
  const [thinkGrading, setThinkGrading] = useState<Set<number>>(new Set());
  const [thinkSaved, setThinkSaved] = useState(false);
  const { toast } = useToast();

  // Book-level graph hook
  const bookGraph = useBookKnowledgeGraph(bookId);

  const cacheKey = `kg-${bookId}-ch${chapterNumber}`;

  const extractGraph = useCallback(async () => {
    if (!chapterContent || chapterContent.length < 50) return;

    // If we already have persistent book graph data for this chapter/book, prefer it immediately.
    if (bookGraph.hasGraph) {
      const hasChapterNodes = bookGraph.getNodesForChapter(chapterNumber).length > 0;
      setViewMode(hasChapterNodes ? 'chapter' : 'book');
    }

    // Check localStorage cache
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.concepts?.length > 0) {
          setChapterGraph(parsed);
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

      if (bookId && data.concepts) {
        await bookGraph.mergeChapterGraph(chapterNumber, data.concepts, data.relationships, data.mermaidGraph);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to extract knowledge graph';
      setError(msg);

      if (!bookGraph.hasGraph) {
        toast({ title: 'Knowledge extraction failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, chapterNumber, cacheKey, toast, bookId, bookGraph]);

  // Auto-extract when panel opens, but don't block already-persisted book graph rendering
  useEffect(() => {
    if (!isOpen) return;

    if (bookGraph.hasGraph) {
      const hasChapterNodes = bookGraph.getNodesForChapter(chapterNumber).length > 0;
      setViewMode(hasChapterNodes ? 'chapter' : 'book');
    }

    if (!chapterGraph && !isLoading && !bookGraph.hasGraph) {
      extractGraph();
    }
  }, [isOpen, chapterGraph, isLoading, extractGraph, bookGraph, chapterNumber]);

  // Reset on chapter change
  useEffect(() => {
    setChapterGraph(null);
    setExpandedConcept(null);
    setRevealedAnswers(new Set());
    setSelectedNodeId(null);
    setThinkAnswers({});
    setThinkGrades({});
    setThinkFeedback({});
    setThinkGrading(new Set());
    setThinkSaved(false);
  }, [chapterNumber, bookId]);

  const toggleAnswer = (idx: number) => {
    setRevealedAnswers(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ─── Think Tab: AI-grade a single answer ───
  const gradeAnswer = useCallback(async (questionIdx: number, question: string, answer: string) => {
    setThinkGrading(prev => new Set(prev).add(questionIdx));
    try {
      const { data, error } = await supabase.functions.invoke('grade-think-answer', {
        body: { question, answer, chapterTitle, bookTitle },
      });
      if (error) throw error;
      
      setThinkGrades(prev => ({ ...prev, [questionIdx]: data.grade }));
      setThinkFeedback(prev => ({ ...prev, [questionIdx]: data.feedback }));
    } catch {
      toast({ title: 'Grading failed, please try again', variant: 'destructive' });
    } finally {
      setThinkGrading(prev => { const n = new Set(prev); n.delete(questionIdx); return n; });
    }
  }, [chapterTitle, bookTitle, toast]);

  // ─── Think Tab: Save session to certification ───
  const saveThinkSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !bookId) return;

    const graded = Object.entries(thinkGrades);
    if (graded.length === 0) return;

    const avgQuality = graded.reduce((s, [, q]) => s + (q as number), 0) / graded.length;
    const bloomLevel = avgQuality >= 4 ? 'apply' : avgQuality >= 3 ? 'understand' : 'remember';
    const masteryStatus = avgQuality >= 4 ? 'mastered' : avgQuality >= 3 ? 'developing' : 'struggling';
    const masteryPercent = Math.round((graded.filter(([, q]) => (q as number) >= 4).length / graded.length) * 100);

    try {
      await supabase.from('learning_progress').insert({
        user_id: user.id,
        book_id: bookId,
        score: Math.round(avgQuality * 20),
        bloom_level: bloomLevel,
        mastery_status: masteryStatus,
        questions_answered: graded.length,
        question_difficulty: Math.round(avgQuality),
        time_spent_seconds: 0,
      });

      // Update competency profile
      const bloomField = `${bloomLevel}_score` as const;
      const { data: existing } = await supabase
        .from('competency_profile')
        .select('*')
        .eq('user_id', user.id)
        .eq('domain', 'general')
        .maybeSingle();

      if (existing) {
        const currentScore = Number((existing as any)[bloomField] || 0);
        const newScore = Math.min(100, currentScore + (avgQuality * 3));
        await supabase.from('competency_profile')
          .update({ [bloomField]: newScore, total_attempts: (existing.total_attempts || 0) + 1, last_updated: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase.from('competency_profile').insert({
          user_id: user.id,
          domain: 'general',
          [bloomField]: avgQuality * 3,
          total_attempts: 1,
        });
      }

      setThinkSaved(true);
      toast({ title: `${masteryPercent}% mastery · Added to certification`, description: `${graded.length} questions graded at ${bloomLevel} level` });
    } catch {
      toast({ title: 'Failed to save progress', variant: 'destructive' });
    }
  }, [thinkGrades, bookId, toast]);

  // Book-level nodes, optionally filtered by chapter
  const bookNodes = viewMode === 'book' ? bookGraph.nodes : bookGraph.getNodesForChapter(chapterNumber);
  const bookMermaid = bookGraph.generateBookMermaid();
  const weakConcepts = bookGraph.getWeakConcepts();

  // Resolve selected concept from book nodes OR chapter concepts
  const selectedBookNode = selectedNodeId ? bookGraph.nodes.find(n => n.id === selectedNodeId) : null;
  const selectedChapterConcept = selectedNodeId && !selectedBookNode && chapterGraph
    ? chapterGraph.concepts.find(c => c.id === selectedNodeId) : null;

  const selectedConcept: ConceptDetail | null = selectedBookNode
    ? {
        id: selectedBookNode.id,
        label: selectedBookNode.label,
        definition: selectedBookNode.definition,
        chapters_referenced: selectedBookNode.chapters_referenced,
        chapter_first_seen: selectedBookNode.chapter_first_seen,
        examples: selectedBookNode.examples,
        applications: selectedBookNode.applications,
        importance: selectedBookNode.importance,
        difficulty: selectedBookNode.difficulty,
      }
    : selectedChapterConcept
    ? {
        id: selectedChapterConcept.id,
        label: selectedChapterConcept.label,
        definition: selectedChapterConcept.description,
        importance: selectedChapterConcept.importance,
        chapters_referenced: [chapterNumber],
        chapter_first_seen: chapterNumber,
      }
    : null;

  const allConceptDetails: ConceptDetail[] = bookGraph.nodes.length > 0
    ? bookGraph.nodes.map(n => ({ id: n.id, label: n.label, definition: n.definition, chapters_referenced: n.chapters_referenced, chapter_first_seen: n.chapter_first_seen, examples: n.examples, applications: n.applications, importance: n.importance, difficulty: n.difficulty }))
    : (chapterGraph?.concepts || []).map(c => ({ id: c.id, label: c.label, definition: c.description, importance: c.importance }));

  const selectedLearnerState = selectedNodeId ? bookGraph.learnerStates.find(s => s.concept_node_id === selectedNodeId) : undefined;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/80"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[71] bg-background rounded-t-2xl max-h-[min(85vh,720px)] overflow-hidden flex flex-col pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lg"
          >
            {/* Close button */}
            <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-sm opacity-70 hover:opacity-100 transition-opacity">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
            {/* Header */}
            <div className="px-6 pt-6 pb-2 shrink-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Brain className="h-5 w-5 text-primary" />
                Knowledge Graph Brain
                {bookGraph.hasGraph && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {bookGraph.nodes.length} concepts · {bookGraph.edges.length} links
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <span>Ch. {chapterNumber}: {chapterTitle}</span>
                {bookGraph.meta && (
                  <span className="text-muted-foreground">
                    · {bookGraph.meta.chapters_indexed?.length || 0} chapters indexed
                  </span>
                )}
              </p>
            </div>

        <div className="px-6 flex-1 overflow-hidden flex flex-col">
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
        {isLoading && !chapterGraph && !bookGraph.hasGraph && (
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

                {/* Interactive Mind Map */}
                {viewMode === 'book' && bookNodes.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" /> Book-Level Mind Map
                      <span className="text-[10px] ml-auto opacity-60">drag nodes · scroll to zoom · click to inspect</span>
                    </p>
                    <InteractiveMindMap
                      concepts={bookNodes.map(n => ({ id: n.id, label: n.label, importance: n.importance, definition: n.definition }))}
                      relationships={bookGraph.edges.map(e => ({ source: e.source_node_id, target: e.target_node_id, type: e.relationship_type }))}
                      onSelectNode={(id) => setSelectedNodeId(id)}
                      selectedNodeId={selectedNodeId}
                      className="min-h-[350px]"
                    />
                  </div>
                ) : chapterGraph?.concepts?.length ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Chapter Mind Map</p>
                    <InteractiveMindMap
                      concepts={chapterGraph.concepts.map(c => ({ id: c.id, label: c.label, importance: c.importance, definition: c.description }))}
                      relationships={chapterGraph.relationships}
                      onSelectNode={(id) => setSelectedNodeId(id)}
                      selectedNodeId={selectedNodeId}
                      className="min-h-[300px]"
                    />
                  </div>
                ) : null}

                {/* Concept List — book-level nodes */}
                {bookNodes.length > 0 ? (
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

              {/* Layer 4: Active Cognition — Answer + Grade + Certify */}
              <TabsContent value="activate" className="mt-0 space-y-3">
                <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 mb-2">
                  <p className="text-xs text-foreground/70 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Type your answer, reveal, then self-grade to add to certification
                  </p>
                  {Object.keys(thinkGrades).length > 0 && (
                    <div className="mt-2">
                      <Progress value={(Object.keys(thinkGrades).length / (chapterGraph?.activeQuestions.length || 1)) * 100} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {Object.keys(thinkGrades).length}/{chapterGraph?.activeQuestions.length || 0} graded
                      </p>
                    </div>
                  )}
                </div>
                {chapterGraph?.activeQuestions.map((q, i) => {
                  const isRevealed = thinkRevealed.has(i);
                  const grade = thinkGrades[i];
                  const hasGrade = grade !== undefined;

                  return (
                    <div key={i} className={cn(
                      "bg-card border rounded-lg p-4 transition-all",
                      hasGrade && grade >= 4 ? "border-emerald-500/40 bg-emerald-500/5" :
                      hasGrade && grade >= 3 ? "border-amber-500/40 bg-amber-500/5" :
                      hasGrade ? "border-destructive/40 bg-destructive/5" :
                      "border-border/50"
                    )}>
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          hasGrade && grade >= 4 ? "bg-emerald-500/20 text-emerald-600" :
                          hasGrade ? "bg-primary/20 text-primary" :
                          "bg-primary/20 text-primary"
                        )}>
                          {hasGrade ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm font-medium leading-relaxed">{q}</p>

                          {/* Answer Input */}
                          {!hasGrade && (
                            <Textarea
                              value={thinkAnswers[i] || ''}
                              onChange={(e) => setThinkAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                              placeholder="Type your answer…"
                              className="min-h-[60px] resize-none text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && thinkAnswers[i]?.trim()) {
                                  setThinkRevealed(prev => new Set(prev).add(i));
                                }
                              }}
                            />
                          )}

                          {/* Reveal / Already answered */}
                          {!isRevealed && !hasGrade && (
                            <div className="flex gap-2">
                              <Button variant="default" size="sm" className="text-xs gap-1.5"
                                disabled={!thinkAnswers[i]?.trim()}
                                onClick={() => setThinkRevealed(prev => new Set(prev).add(i))}>
                                <Eye className="h-3.5 w-3.5" /> Reveal & Grade
                              </Button>
                              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                                onClick={() => {
                                  setThinkRevealed(prev => new Set(prev).add(i));
                                }}>
                                Skip
                              </Button>
                            </div>
                          )}

                          {/* Show user's answer after reveal */}
                          {isRevealed && thinkAnswers[i]?.trim() && !hasGrade && (
                            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Your Answer</span>
                              <p className="text-xs mt-0.5">{thinkAnswers[i]}</p>
                            </div>
                          )}

                          {/* SRS Grade Buttons */}
                          {isRevealed && !hasGrade && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                              <p className="text-[10px] text-muted-foreground text-center font-medium">How well did you know this?</p>
                              <div className="grid grid-cols-5 gap-1">
                                {[
                                  { q: 1, label: 'Wrong', emoji: '❌', color: 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive/30' },
                                  { q: 2, label: 'Barely', emoji: '😰', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/40 hover:bg-orange-500/30' },
                                  { q: 3, label: 'Okay', emoji: '🤔', color: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30' },
                                  { q: 4, label: 'Good', emoji: '✅', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30' },
                                  { q: 5, label: 'Perfect', emoji: '🌟', color: 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30' },
                                ].map((g) => (
                                  <button key={g.q} onClick={() => setThinkGrades(prev => ({ ...prev, [i]: g.q }))}
                                    className={cn('flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all text-[10px]', g.color)}>
                                    <span>{g.emoji}</span>
                                    <span className="font-medium">{g.label}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}

                          {/* Graded indicator */}
                          {hasGrade && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px]">
                                {grade >= 4 ? '✅' : grade >= 3 ? '🤔' : '❌'} {grade >= 4 ? 'Good' : grade >= 3 ? 'Okay' : 'Needs review'}
                              </Badge>
                              {thinkAnswers[i]?.trim() && (
                                <span className="text-[10px] opacity-60 truncate max-w-[150px]">"{thinkAnswers[i]}"</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Save to certification */}
                {Object.keys(thinkGrades).length > 0 && !thinkSaved && (
                  <Button variant="default" className="w-full gap-2" onClick={saveThinkSession}>
                    <Award className="h-4 w-4" />
                    Save to Certification ({Object.keys(thinkGrades).length} graded)
                  </Button>
                )}
                {thinkSaved && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center gap-2 text-sm">
                    <Award className="h-4 w-4 text-primary" />
                    <span className="text-primary font-medium">Session saved to certification profile</span>
                  </div>
                )}
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
          {selectedConcept && (
            <ConceptDetailDrawer
              concept={selectedConcept}
              allConcepts={allConceptDetails}
              bookEdges={bookGraph.edges}
              chapterRelationships={chapterGraph?.relationships}
              learnerState={selectedLearnerState}
              onClose={() => setSelectedNodeId(null)}
              onNavigateConcept={(id) => setSelectedNodeId(id)}
            />
          )}
        </AnimatePresence>
        </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
