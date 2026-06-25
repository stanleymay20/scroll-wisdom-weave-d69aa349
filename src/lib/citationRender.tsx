// Phase 2.1 — Inline [cite:key] renderer.
// Replaces [cite:key1] or [cite:key1,key2] markers in markdown/HTML
// with numbered superscript links, returning a node tree + an ordered
// list of citations used in source order. Safe for SSR (no DOM access).

import React from "react";
import type { CitationRecord } from "./citationStyles";

const CITE_RE = /\[cite:([a-zA-Z0-9_\-,\s]+)\]/g;

export interface RenderedCitations {
  nodes: React.ReactNode[];
  order: { key: string; index: number; record: CitationRecord | null }[];
}

export function renderInlineCitations(
  text: string,
  citationsByKey: Record<string, CitationRecord>,
): RenderedCitations {
  const nodes: React.ReactNode[] = [];
  const orderMap = new Map<string, number>();
  const order: RenderedCitations["order"] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let nodeKey = 0;
  CITE_RE.lastIndex = 0;
  while ((match = CITE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const keys = match[1].split(",").map((k) => k.trim()).filter(Boolean);
    const refs: number[] = [];
    for (const key of keys) {
      let idx = orderMap.get(key);
      if (idx === undefined) {
        idx = orderMap.size + 1;
        orderMap.set(key, idx);
        order.push({ key, index: idx, record: citationsByKey[key] ?? null });
      }
      refs.push(idx);
    }
    nodes.push(
      <sup key={`cite-${nodeKey++}`} className="text-primary font-medium ml-0.5">
        [{refs.join(",")}]
      </sup>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return { nodes, order };
}

// Strip cite markers for plain-text contexts (TTS, search index, exports
// that build their own reference handling).
export function stripCiteMarkers(text: string): string {
  return text.replace(CITE_RE, "");
}
