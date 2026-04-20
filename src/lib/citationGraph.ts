/**
 * Citation Graph (Atlas-style)
 * =============================
 * Builds a tri-partite, navigable graph from a book's:
 *   - concept_nodes        (concepts)
 *   - chapters.content     (claims = paragraphs that contain inline citations)
 *   - book_citations       (sources)
 *
 * The output is a force-laid-out graph the UI can render with simple SVG
 * (no D3 dependency) plus a "verify this claim" lookup table.
 */

import { parseCitations, type ParsedCitation } from '@/lib/citationParsing';

export type GraphNodeKind = 'concept' | 'claim' | 'source';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  detail?: string;
  chapter?: number;
  // computed in layout pass
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'concept-claim' | 'claim-source';
}

export interface ClaimRecord {
  id: string;
  chapter: number;
  text: string;
  citations: ParsedCitation[];
  conceptIds: string[];
  sourceIds: string[];
}

export interface CitationGraphInput {
  concepts: Array<{ id: string; label: string; normalized_label: string; chapters_referenced: number[] }>;
  citations: Array<{ id: string; citation_text: string; author?: string | null; chapter_id?: string | null }>;
  chapters: Array<{ id: string; chapter_number: number; content: string | null }>;
}

export interface CitationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  claims: ClaimRecord[];
  stats: {
    concepts: number;
    claims: number;
    sources: number;
    unverifiedClaims: number;
  };
}

// ---------- helpers ----------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function authorKeyOfCitation(c: { author?: string | null; citation_text: string }): string {
  if (c.author) return normalize(c.author.split(/[,&]/)[0]);
  // pull first capitalized word from citation_text
  const m = c.citation_text.match(/[A-ZÀ-Ÿ][a-zà-ÿ]+/);
  return m ? normalize(m[0]) : normalize(c.citation_text.slice(0, 24));
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40); // ignore tiny lines / headings
}

// ---------- build graph ----------

export function buildCitationGraph(input: CitationGraphInput): CitationGraph {
  const conceptIndex = new Map<string, { id: string; label: string }>();
  for (const c of input.concepts) {
    conceptIndex.set(normalize(c.label), { id: c.id, label: c.label });
    if (c.normalized_label) conceptIndex.set(c.normalized_label, { id: c.id, label: c.label });
  }

  const sourceByKey = new Map<string, { id: string; label: string }>();
  for (const cit of input.citations) {
    const key = authorKeyOfCitation(cit);
    if (!sourceByKey.has(key)) {
      sourceByKey.set(key, {
        id: `source:${cit.id}`,
        label: cit.author?.trim() || cit.citation_text.slice(0, 60),
      });
    }
  }

  const claims: ClaimRecord[] = [];
  const edges: GraphEdge[] = [];
  const claimNodes: GraphNode[] = [];

  for (const ch of input.chapters) {
    if (!ch.content) continue;
    const paragraphs = splitParagraphs(ch.content);
    paragraphs.forEach((para, pIdx) => {
      const parsed = parseCitations(para, 'auto');
      if (parsed.length === 0) return; // not a verifiable claim
      const claimId = `claim:${ch.chapter_number}:${pIdx}`;

      // Match concepts mentioned in the paragraph
      const lower = para.toLowerCase();
      const matchedConceptIds = new Set<string>();
      for (const [needle, c] of conceptIndex) {
        if (needle.length < 3) continue;
        if (lower.includes(needle)) matchedConceptIds.add(c.id);
      }

      // Match sources by author key
      const matchedSourceIds = new Set<string>();
      for (const p of parsed) {
        const key = normalize(p.authorKey);
        for (const [skey, s] of sourceByKey) {
          if (skey.includes(key) || key.includes(skey)) {
            matchedSourceIds.add(s.id);
          }
        }
      }

      claims.push({
        id: claimId,
        chapter: ch.chapter_number,
        text: para.length > 240 ? para.slice(0, 237) + '…' : para,
        citations: parsed,
        conceptIds: [...matchedConceptIds],
        sourceIds: [...matchedSourceIds],
      });

      claimNodes.push({
        id: claimId,
        kind: 'claim',
        label: `Ch ${ch.chapter_number} · claim`,
        detail: para.slice(0, 120),
        chapter: ch.chapter_number,
      });

      for (const cid of matchedConceptIds) {
        edges.push({ source: cid, target: claimId, kind: 'concept-claim' });
      }
      for (const sid of matchedSourceIds) {
        edges.push({ source: claimId, target: sid, kind: 'claim-source' });
      }
    });
  }

  // Only keep concepts/sources that participate in at least one edge
  const usedConceptIds = new Set(edges.filter((e) => e.kind === 'concept-claim').map((e) => e.source));
  const usedSourceIds = new Set(edges.filter((e) => e.kind === 'claim-source').map((e) => e.target));

  const conceptNodes: GraphNode[] = input.concepts
    .filter((c) => usedConceptIds.has(c.id))
    .map((c) => ({ id: c.id, kind: 'concept', label: c.label }));

  const sourceNodes: GraphNode[] = [...sourceByKey.values()]
    .filter((s) => usedSourceIds.has(s.id))
    .map((s) => ({ id: s.id, kind: 'source', label: s.label }));

  const nodes = layoutTripartite(conceptNodes, claimNodes, sourceNodes);

  const unverifiedClaims = claims.filter((c) => c.sourceIds.length === 0).length;

  return {
    nodes,
    edges,
    claims,
    stats: {
      concepts: conceptNodes.length,
      claims: claims.length,
      sources: sourceNodes.length,
      unverifiedClaims,
    },
  };
}

// ---------- simple deterministic layout ----------

function layoutTripartite(
  concepts: GraphNode[],
  claims: GraphNode[],
  sources: GraphNode[]
): GraphNode[] {
  const W = 1000;
  const H = 700;
  const colX = { concept: 120, claim: W / 2, source: W - 120 };

  function place(list: GraphNode[], x: number): GraphNode[] {
    if (list.length === 0) return [];
    const step = (H - 80) / Math.max(list.length, 1);
    return list.map((n, i) => ({ ...n, x, y: 40 + i * step }));
  }

  return [
    ...place(concepts, colX.concept),
    ...place(claims, colX.claim),
    ...place(sources, colX.source),
  ];
}
