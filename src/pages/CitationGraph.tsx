/**
 * Citation Graph Page
 * ====================
 * Atlas-style tri-partite view: concepts ↔ claims ↔ sources, with a
 * "Verify this claim" inspector for any selected paragraph.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { buildCitationGraph, type CitationGraph, type ClaimRecord } from '@/lib/citationGraph';
import { cn } from '@/lib/utils';

export default function CitationGraphPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [loading, setLoading] = useState(true);
  const [bookTitle, setBookTitle] = useState('');
  const [graph, setGraph] = useState<CitationGraph | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [bookRes, conceptsRes, citationsRes, chaptersRes] = await Promise.all([
          supabase.from('books').select('title').eq('id', bookId).maybeSingle(),
          supabase
            .from('concept_nodes')
            .select('id,label,normalized_label,chapters_referenced')
            .eq('book_id', bookId),
          supabase.from('book_citations').select('id,citation_text,author,chapter_id').eq('book_id', bookId),
          supabase
            .from('chapters')
            .select('id,chapter_number,content')
            .eq('book_id', bookId)
            .order('chapter_number'),
        ]);
        if (cancelled) return;
        setBookTitle(bookRes.data?.title || 'Citation Graph');
        const g = buildCitationGraph({
          concepts: conceptsRes.data || [],
          citations: citationsRes.data || [],
          chapters: chaptersRes.data || [],
        });
        setGraph(g);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const visibleEdges = useMemo(() => {
    if (!graph) return [];
    if (!hoverId && !selectedClaim) return graph.edges;
    const focus = selectedClaim?.id ?? hoverId;
    return graph.edges.filter((e) => e.source === focus || e.target === focus);
  }, [graph, hoverId, selectedClaim]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to={`/book/${bookId}`}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to book
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Citation Graph</h1>
            <p className="text-sm text-muted-foreground">
              {bookTitle} · concepts ↔ claims ↔ sources
            </p>
          </div>
          {graph && (
            <div className="hidden gap-2 sm:flex">
              <StatBadge label="Concepts" value={graph.stats.concepts} tone="primary" />
              <StatBadge label="Claims" value={graph.stats.claims} tone="muted" />
              <StatBadge label="Sources" value={graph.stats.sources} tone="primary" />
              <StatBadge
                label="Unverified"
                value={graph.stats.unverifiedClaims}
                tone={graph.stats.unverifiedClaims > 0 ? 'warning' : 'success'}
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !graph || graph.claims.length === 0 ? (
          <EmptyState bookId={bookId} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="overflow-hidden p-2">
              <div className="mb-2 flex items-center justify-between px-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <LegendDot tone="primary" /> Concept
                  <LegendDot tone="muted" /> Claim
                  <LegendDot tone="accent" /> Source
                </div>
                <span>Click a claim node to inspect</span>
              </div>
              <div className="relative w-full overflow-x-auto">
                <svg viewBox="0 0 1000 700" className="h-[640px] w-full min-w-[680px]">
                  {/* edges */}
                  {visibleEdges.map((e, i) => {
                    const s = graph.nodes.find((n) => n.id === e.source);
                    const t = graph.nodes.find((n) => n.id === e.target);
                    if (!s || !t || s.x == null || t.x == null) return null;
                    return (
                      <line
                        key={i}
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        className={cn(
                          'transition-opacity',
                          e.kind === 'concept-claim'
                            ? 'stroke-primary/50'
                            : 'stroke-accent-foreground/40'
                        )}
                        strokeWidth={1}
                      />
                    );
                  })}
                  {/* nodes */}
                  {graph.nodes.map((n) => {
                    const isSelected =
                      selectedClaim?.id === n.id ||
                      selectedClaim?.conceptIds.includes(n.id) ||
                      selectedClaim?.sourceIds.includes(n.id);
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x},${n.y})`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoverId(n.id)}
                        onMouseLeave={() => setHoverId(null)}
                        onClick={() => {
                          if (n.kind === 'claim') {
                            const claim = graph.claims.find((c) => c.id === n.id) || null;
                            setSelectedClaim(claim);
                          }
                        }}
                      >
                        <circle
                          r={n.kind === 'claim' ? 5 : 7}
                          className={cn(
                            'transition-all',
                            n.kind === 'concept' && 'fill-primary',
                            n.kind === 'claim' && 'fill-muted-foreground',
                            n.kind === 'source' && 'fill-accent-foreground',
                            isSelected && 'stroke-foreground',
                          )}
                          strokeWidth={isSelected ? 2 : 0}
                        />
                        <text
                          x={n.kind === 'source' ? -10 : 10}
                          y={4}
                          textAnchor={n.kind === 'source' ? 'end' : 'start'}
                          className="fill-foreground text-[10px]"
                        >
                          {n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Verify this claim</h2>
              {!selectedClaim ? (
                <p className="text-sm text-muted-foreground">
                  Select a claim node from the graph to inspect its citations and concept links.
                </p>
              ) : (
                <ClaimInspector claim={selectedClaim} graph={graph} bookId={bookId!} />
              )}
              <div className="mt-6 border-t pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent claims
                </h3>
                <ScrollArea className="h-[280px] pr-2">
                  <ul className="space-y-2">
                    {graph.claims.slice(0, 40).map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => setSelectedClaim(c)}
                          className={cn(
                            'w-full rounded-md border px-3 py-2 text-left text-xs transition-colors',
                            selectedClaim?.id === c.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">
                              Ch {c.chapter}
                            </Badge>
                            {c.sourceIds.length > 0 ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </div>
                          <div className="line-clamp-2 text-muted-foreground">{c.text}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </Card>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function ClaimInspector({
  claim,
  graph,
  bookId,
}: {
  claim: ClaimRecord;
  graph: CitationGraph;
  bookId: string;
}) {
  const concepts = graph.nodes.filter((n) => n.kind === 'concept' && claim.conceptIds.includes(n.id));
  const sources = graph.nodes.filter((n) => n.kind === 'source' && claim.sourceIds.includes(n.id));
  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="outline">Chapter {claim.chapter}</Badge>
          {claim.sourceIds.length === 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              Unverified
            </Badge>
          )}
        </div>
        <p className="text-foreground/90">{claim.text}</p>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Cited ({claim.citations.length})
        </div>
        <div className="flex flex-wrap gap-1">
          {claim.citations.map((c, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {c.raw}
            </Badge>
          ))}
        </div>
      </div>

      {concepts.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Concepts ({concepts.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {concepts.map((c) => (
              <Badge key={c.id} variant="outline" className="text-[10px]">
                {c.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Sources ({sources.length})
          </div>
          <ul className="space-y-1 text-xs">
            {sources.map((s) => (
              <li key={s.id} className="rounded border px-2 py-1">
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button asChild variant="outline" size="sm" className="w-full">
        <Link to={`/book/${bookId}`}>
          <BookOpen className="mr-2 h-4 w-4" /> Open book
        </Link>
      </Button>
    </div>
  );
}

function StatBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'muted' | 'warning' | 'success';
}) {
  const cls =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'warning'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : tone === 'success'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : 'bg-muted text-muted-foreground';
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-xs font-medium', cls)}>
      {value} <span className="opacity-70">{label}</span>
    </div>
  );
}

function LegendDot({ tone }: { tone: 'primary' | 'muted' | 'accent' }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          tone === 'primary' && 'bg-primary',
          tone === 'muted' && 'bg-muted-foreground',
          tone === 'accent' && 'bg-accent-foreground'
        )}
      />
    </span>
  );
}

function EmptyState({ bookId }: { bookId?: string }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <BookOpen className="h-10 w-10 text-muted-foreground" />
      <div className="text-lg font-semibold">No citations detected</div>
      <p className="max-w-md text-sm text-muted-foreground">
        This book doesn't yet have inline citations or concept extractions to map. Generate or import
        chapters with citations to populate the graph.
      </p>
      {bookId && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/book/${bookId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to book
          </Link>
        </Button>
      )}
    </Card>
  );
}
