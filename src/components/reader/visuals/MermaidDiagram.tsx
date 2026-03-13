/**
 * MermaidDiagram — Live Mermaid rendering for flowcharts, trees, concept maps
 * ===========================================================================
 * Used by FigureRenderer when renderMode === 'mermaid'
 */

import { memo, useEffect, useRef, useState, useId } from 'react';
import { AlertCircle } from 'lucide-react';

interface MermaidDiagramProps {
  definition: string;
  className?: string;
}

/**
 * Generates a Mermaid definition from a figure description when no explicit
 * mermaid code block is provided. Maps visual types to sensible defaults.
 */
export function descriptionToMermaid(description: string, visualType: string): string {
  const lines = description
    .split(/[.;\n]/)
    .map(l => l.trim())
    .filter(l => l.length > 3);

  if (visualType === 'taxonomy_tree' || visualType === 'concept_map') {
    if (lines.length < 2) {
      return `graph TD\n  A["${lines[0] || description}"]`;
    }
    const nodes = lines.slice(0, 8).map((line, i) => {
      const id = String.fromCharCode(65 + i);
      return `  ${i === 0 ? '' : 'A --> '}${id}["${line.substring(0, 60)}"]`;
    });
    return `graph TD\n${nodes.join('\n')}`;
  }

  if (visualType === 'lifecycle_model') {
    const steps = lines.slice(0, 8);
    const nodes = steps.map((step, i) => {
      const id = String.fromCharCode(65 + i);
      const next = i < steps.length - 1 ? ` --> ${String.fromCharCode(66 + i)}` : '';
      return `  ${id}["${step.substring(0, 50)}"]${next}`;
    });
    // Loop back for lifecycle
    if (steps.length > 2) {
      nodes.push(`  ${String.fromCharCode(64 + steps.length)} --> A`);
    }
    return `graph LR\n${nodes.join('\n')}`;
  }

  if (visualType === 'architecture_diagram') {
    const components = lines.slice(0, 6);
    const nodes = components.map((comp, i) => {
      const id = String.fromCharCode(65 + i);
      return `  ${id}["${comp.substring(0, 50)}"]`;
    });
    // Connect sequentially
    const edges = components.slice(1).map((_, i) => {
      return `  ${String.fromCharCode(65 + i)} --> ${String.fromCharCode(66 + i)}`;
    });
    return `graph TD\n${nodes.join('\n')}\n${edges.join('\n')}`;
  }

  // Default flowchart
  const steps = lines.slice(0, 8);
  if (steps.length === 0) {
    return `graph TD\n  A["${description.substring(0, 60)}"]`;
  }
  const nodes = steps.map((step, i) => {
    const id = String.fromCharCode(65 + i);
    const next = i < steps.length - 1 ? ` --> ${String.fromCharCode(66 + i)}` : '';
    return `  ${id}["${step.substring(0, 50)}"]${next}`;
  });
  return `graph TD\n${nodes.join('\n')}`;
}

export const MermaidDiagram = memo(function MermaidDiagram({ definition, className = '' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const uniqueId = useId().replace(/:/g, '_');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setRendering(true);
      setError(null);

      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        if (cancelled || !containerRef.current) return;

        const { svg } = await mermaid.render(`mermaid_${uniqueId}`, definition);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [definition, uniqueId]);

  if (error) {
    return (
      <div className={`bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-center ${className}`}>
        <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
        <p className="text-xs text-destructive/80">Diagram rendering failed</p>
        <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded overflow-x-auto text-left">
          {definition}
        </pre>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 rounded-lg">
          <div className="text-xs text-muted-foreground animate-pulse">Rendering diagram…</div>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex justify-center overflow-x-auto [&_svg]:max-w-full"
      />
    </div>
  );
});
