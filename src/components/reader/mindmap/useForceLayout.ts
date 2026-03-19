/**
 * Lightweight force-directed layout simulation (no external deps).
 * Runs a simple n-body simulation + link springs + center gravity.
 */

import { useRef, useState, useCallback, useEffect } from 'react';

export interface ForceNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  importance: number;
  fx?: number | null; // fixed x (while dragging)
  fy?: number | null;
}

export interface ForceLink {
  source: string;
  target: string;
  type: string;
}

const REPULSION = 4000;
const LINK_DISTANCE = 140;
const LINK_STRENGTH = 0.06;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.85;
const MIN_VELOCITY = 0.01;
const MAX_TICKS = 300;

function initPositions(count: number, width: number, height: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.3;
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    positions.push({
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 30,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 30,
    });
  }
  return positions;
}

export function useForceLayout(
  nodeData: Array<{ id: string; label: string; importance: number }>,
  linkData: ForceLink[],
  width: number,
  height: number,
) {
  const nodesRef = useRef<ForceNode[]>([]);
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const tickRef = useRef(0);
  const rafRef = useRef<number>(0);
  const isRunningRef = useRef(false);

  // Initialize nodes when data changes
  useEffect(() => {
    if (nodeData.length === 0) { setNodes([]); return; }

    const positions = initPositions(nodeData.length, width, height);
    const existingMap = new Map(nodesRef.current.map(n => [n.id, n]));

    const newNodes: ForceNode[] = nodeData.map((nd, i) => {
      const existing = existingMap.get(nd.id);
      return {
        id: nd.id,
        label: nd.label,
        importance: nd.importance,
        x: existing?.x ?? positions[i].x,
        y: existing?.y ?? positions[i].y,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
      };
    });

    nodesRef.current = newNodes;
    tickRef.current = 0;
    setNodes([...newNodes]);
    startSimulation();

    return () => { cancelAnimationFrame(rafRef.current); isRunningRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeData, linkData, width, height]);

  const tick = useCallback(() => {
    const ns = nodesRef.current;
    if (ns.length === 0) return;

    const cx = width / 2;
    const cy = height / 2;

    // Repulsion (n-body)
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        let dx = ns[j].x - ns[i].x;
        let dy = ns[j].y - ns[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        ns[i].vx -= fx;
        ns[i].vy -= fy;
        ns[j].vx += fx;
        ns[j].vy += fy;
      }
    }

    // Link attraction
    const nodeMap = new Map(ns.map(n => [n.id, n]));
    for (const link of linkData) {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - LINK_DISTANCE;
      const fx = (dx / dist) * displacement * LINK_STRENGTH;
      const fy = (dy / dist) * displacement * LINK_STRENGTH;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Center gravity + update positions
    let totalV = 0;
    for (const n of ns) {
      n.vx += (cx - n.x) * CENTER_GRAVITY;
      n.vy += (cy - n.y) * CENTER_GRAVITY;
      n.vx *= DAMPING;
      n.vy *= DAMPING;

      if (n.fx != null) { n.x = n.fx; n.vx = 0; }
      else n.x += n.vx;
      if (n.fy != null) { n.y = n.fy; n.vy = 0; }
      else n.y += n.vy;

      totalV += Math.abs(n.vx) + Math.abs(n.vy);
    }

    setNodes([...ns]);
    tickRef.current++;

    if (totalV / ns.length > MIN_VELOCITY && tickRef.current < MAX_TICKS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      isRunningRef.current = false;
    }
  }, [linkData, width, height]);

  const startSimulation = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    tickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const setNodePosition = useCallback((id: string, x: number, y: number, fixed: boolean) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (!node) return;
    node.x = x;
    node.y = y;
    node.fx = fixed ? x : null;
    node.fy = fixed ? y : null;
    if (fixed) {
      setNodes([...nodesRef.current]);
      if (!isRunningRef.current) startSimulation();
    }
  }, [startSimulation]);

  const releaseNode = useCallback((id: string) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (!node) return;
    node.fx = null;
    node.fy = null;
    startSimulation();
  }, [startSimulation]);

  return { nodes, setNodePosition, releaseNode };
}
