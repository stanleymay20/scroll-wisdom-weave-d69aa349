/**
 * Interactive Mind Map — NotebookLM-style knowledge visualization
 * ================================================================
 * Features: force-directed layout, drag nodes, pinch/scroll zoom,
 * pan, tap-to-select, animated edges, importance-based node sizing.
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useForceLayout, ForceLink, ForceNode } from './useForceLayout';

const RELATIONSHIP_COLORS: Record<string, string> = {
  depends_on: 'hsl(var(--primary))',
  extends: 'hsl(var(--primary) / 0.7)',
  contrasts: 'hsl(var(--destructive))',
  contrasts_with: 'hsl(var(--destructive))',
  example_of: 'hsl(var(--accent-foreground) / 0.5)',
  part_of: 'hsl(var(--muted-foreground))',
  leads_to: 'hsl(var(--primary) / 0.6)',
  applies_to: 'hsl(var(--primary) / 0.5)',
  causes: 'hsl(var(--destructive) / 0.7)',
  supports: 'hsl(var(--primary) / 0.4)',
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  depends_on: 'depends on',
  extends: 'extends',
  contrasts: 'contrasts',
  contrasts_with: 'contrasts',
  example_of: 'example of',
  part_of: 'part of',
  leads_to: 'leads to',
  applies_to: 'applies to',
  causes: 'causes',
  supports: 'supports',
};

interface InteractiveMindMapProps {
  concepts: Array<{ id: string; label: string; importance: number; definition?: string | null }>;
  relationships: Array<{ source: string; target: string; type: string }>;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
}

function nodeRadius(importance: number): number {
  return 24 + (importance - 1) * 6;
}

export function InteractiveMindMap({
  concepts,
  relationships,
  onSelectNode,
  selectedNodeId,
  className,
}: InteractiveMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeData = useMemo(() =>
    concepts.map(c => ({ id: c.id, label: c.label, importance: c.importance })),
    [concepts]
  );

  const linkData: ForceLink[] = useMemo(() =>
    relationships.filter(r =>
      concepts.some(c => c.id === r.source) && concepts.some(c => c.id === r.target)
    ),
    [relationships, concepts]
  );

  const { nodes, setNodePosition, releaseNode } = useForceLayout(
    nodeData, linkData, dimensions.width, dimensions.height
  );

  // Build a node map for link rendering
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(3, Math.max(0.3, z * delta)));
  }, []);

  const zoomIn = () => setZoom(z => Math.min(3, z * 1.25));
  const zoomOut = () => setZoom(z => Math.max(0.3, z * 0.8));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Pan handlers
  const handlePanStart = useCallback((e: React.PointerEvent) => {
    if (draggedNode) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [draggedNode, pan]);

  const handlePanMove = useCallback((e: React.PointerEvent) => {
    if (draggedNode) {
      // Dragging a node
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setNodePosition(draggedNode, x, y, true);
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
  }, [isPanning, draggedNode, zoom, pan, setNodePosition]);

  const handlePanEnd = useCallback(() => {
    if (draggedNode) {
      releaseNode(draggedNode);
      setDraggedNode(null);
    }
    setIsPanning(false);
  }, [draggedNode, releaseNode]);

  // Node drag start
  const handleNodeDragStart = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNode(nodeId);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  // Highlighted edges (connected to selected or hovered node)
  const activeNodeId = hoveredNode || selectedNodeId;
  const connectedNodeIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const ids = new Set<string>();
    ids.add(activeNodeId);
    for (const link of linkData) {
      if (link.source === activeNodeId) ids.add(link.target);
      if (link.target === activeNodeId) ids.add(link.source);
    }
    return ids;
  }, [activeNodeId, linkData]);

  if (concepts.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground p-8", className)}>
        No concepts to visualize
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full bg-muted/10 rounded-xl border border-border/50 overflow-hidden select-none", className)} style={{ minHeight: 350 }}>
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={zoomIn} aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={zoomOut} aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm" onClick={resetView} aria-label="Reset view">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-2 left-2 z-10 text-[10px] text-muted-foreground bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
        {Math.round(zoom * 100)}%
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className={cn("cursor-grab", isPanning && "cursor-grabbing", draggedNode && "cursor-grabbing")}
        onWheel={handleWheel}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        <defs>
          {/* Arrow markers for directed edges */}
          <marker id="mindmap-arrow" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 4 L 0 8 z" fill="hsl(var(--muted-foreground) / 0.4)" />
          </marker>
          <marker id="mindmap-arrow-active" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 4 L 0 8 z" fill="hsl(var(--primary))" />
          </marker>
          {/* Glow filter for selected node */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {linkData.map((link, i) => {
            const s = nodeMap.get(link.source);
            const t = nodeMap.get(link.target);
            if (!s || !t) return null;

            const isActive = activeNodeId && (link.source === activeNodeId || link.target === activeNodeId);
            const color = isActive
              ? (RELATIONSHIP_COLORS[link.type] || 'hsl(var(--primary))')
              : 'hsl(var(--muted-foreground) / 0.2)';

            // Shorten line to avoid overlapping node circles
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const sr = nodeRadius(s.importance) + 4;
            const tr = nodeRadius(t.importance) + 4;
            const sx = s.x + (dx / dist) * sr;
            const sy = s.y + (dy / dist) * sr;
            const tx = t.x - (dx / dist) * tr;
            const ty = t.y - (dy / dist) * tr;

            // Midpoint for label
            const mx = (sx + tx) / 2;
            const my = (sy + ty) / 2;

            return (
              <g key={`edge-${i}`}>
                <line
                  x1={sx} y1={sy} x2={tx} y2={ty}
                  stroke={color}
                  strokeWidth={isActive ? 2.5 : 1}
                  strokeDasharray={link.type === 'contrasts' || link.type === 'contrasts_with' ? '6,4' : undefined}
                  markerEnd={isActive ? 'url(#mindmap-arrow-active)' : 'url(#mindmap-arrow)'}
                  style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                />
                {isActive && (
                  <text
                    x={mx} y={my - 6}
                    textAnchor="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize={9}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    {RELATIONSHIP_LABELS[link.type] || link.type}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const r = nodeRadius(node.importance);
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNode === node.id;
            const isConnected = connectedNodeIds.has(node.id);
            const dimmed = activeNodeId && !isConnected;
            const concept = concepts.find(c => c.id === node.id);

            // Truncate label for display
            const maxChars = Math.floor(r / 4);
            const displayLabel = node.label.length > maxChars
              ? node.label.slice(0, maxChars - 1) + '…'
              : node.label;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{
                  cursor: 'pointer',
                  opacity: dimmed ? 0.25 : 1,
                  transition: 'opacity 0.2s',
                }}
                onPointerDown={(e) => handleNodeDragStart(e, node.id)}
                onPointerEnter={() => setHoveredNode(node.id)}
                onPointerLeave={() => setHoveredNode(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode?.(node.id);
                }}
              >
                {/* Glow ring for selected */}
                {(isSelected || isHovered) && (
                  <circle
                    r={r + 6}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    opacity={0.4}
                    filter="url(#node-glow)"
                  />
                )}

                {/* Node circle */}
                <circle
                  r={r}
                  fill={isSelected ? 'hsl(var(--primary))' : 'hsl(var(--background))'}
                  stroke={isSelected ? 'hsl(var(--primary))' : isHovered ? 'hsl(var(--primary) / 0.7)' : 'hsl(var(--border))'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  style={{ transition: 'fill 0.2s, stroke 0.2s' }}
                />

                {/* Importance dots */}
                {node.importance >= 4 && (
                  <circle r={3} cx={r - 6} cy={-r + 6} fill="hsl(var(--primary))" opacity={0.6} />
                )}

                {/* Label */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={node.importance >= 4 ? 11 : 10}
                  fontWeight={node.importance >= 4 ? 600 : 500}
                  fill={isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {displayLabel}
                </text>

                {/* Definition tooltip on hover */}
                {isHovered && concept?.definition && (
                  <foreignObject
                    x={-100} y={r + 8}
                    width={200} height={80}
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                  >
                    <div className="bg-popover text-popover-foreground border border-border rounded-lg px-3 py-2 text-[10px] leading-snug shadow-lg">
                      {concept.definition.slice(0, 120)}{concept.definition.length > 120 ? '…' : ''}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
