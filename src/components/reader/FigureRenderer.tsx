import { memo, useMemo } from "react";

// ===========================================
// SCROLLLIBRARY FIGURE RENDERER LIBRARY v1.0
// Maps visual types to optimal rendering components
// ===========================================

export type RenderMode =
  | 'ai_image'
  | 'mermaid'
  | 'chart_component'
  | 'table_component'
  | 'svg_diagram'
  | 'placeholder';

export interface FigureRendererProps {
  caption: string;
  description: string;
  imageUrl?: string;
  renderMode: RenderMode;
  visualType: string;
  cognitiveScore?: number;
  figureNumber: number;
  className?: string;
}

/**
 * FigureRenderer — Renders a figure using the optimal method for its visual type.
 * 
 * - ai_image: Displays the AI-generated image
 * - mermaid: Renders as a Mermaid diagram (future: live rendering)
 * - chart_component: Renders as a React chart placeholder (future: Recharts)
 * - table_component: Renders as a structured table placeholder
 * - placeholder: Text-only fallback
 */
export const FigureRenderer = memo(function FigureRenderer({
  caption,
  description,
  imageUrl,
  renderMode,
  visualType,
  cognitiveScore,
  figureNumber,
  className = "",
}: FigureRendererProps) {
  const renderedContent = useMemo(() => {
    // If we have an actual image URL, always render it
    if (imageUrl) {
      return (
        <img
          src={imageUrl}
          alt={caption}
          className="w-full max-w-2xl mx-auto rounded-lg shadow-md"
          loading="lazy"
        />
      );
    }

    // Render based on mode
    switch (renderMode) {
      case 'mermaid':
        return (
          <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              📊 Diagram: {visualType.replace(/_/g, ' ')}
            </div>
            <p className="text-sm text-muted-foreground italic">{description}</p>
            <div className="mt-2 text-xs text-primary/60">
              Mermaid diagram rendering available
            </div>
          </div>
        );

      case 'chart_component':
        return (
          <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              📈 Chart: {visualType.replace(/_/g, ' ')}
            </div>
            <p className="text-sm text-muted-foreground italic">{description}</p>
            <div className="mt-2 text-xs text-primary/60">
              Interactive chart rendering available
            </div>
          </div>
        );

      case 'table_component':
        return (
          <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              📋 Table: {visualType.replace(/_/g, ' ')}
            </div>
            <p className="text-sm text-muted-foreground italic">{description}</p>
          </div>
        );

      case 'placeholder':
      default:
        return (
          <div className="bg-muted/20 border border-dashed border-border rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground italic">
              [{visualType.replace(/_/g, ' ')}] {description}
            </p>
          </div>
        );
    }
  }, [imageUrl, renderMode, visualType, description, caption]);

  return (
    <figure className={`my-6 ${className}`}>
      {renderedContent}
      <figcaption className="text-center mt-2 text-sm text-muted-foreground">
        <span className="font-medium">Figure {figureNumber}:</span> {caption}
        {cognitiveScore !== undefined && cognitiveScore > 0 && (
          <span className="ml-2 text-xs text-primary/50" title="Cognitive value score">
            (CV: {cognitiveScore})
          </span>
        )}
      </figcaption>
    </figure>
  );
});

/**
 * Render mode badge for diagnostic/admin views
 */
export function RenderModeBadge({ mode }: { mode: RenderMode }) {
  const labels: Record<RenderMode, { label: string; color: string }> = {
    ai_image: { label: 'AI Image', color: 'bg-purple-100 text-purple-700' },
    mermaid: { label: 'Mermaid', color: 'bg-blue-100 text-blue-700' },
    chart_component: { label: 'Chart', color: 'bg-green-100 text-green-700' },
    table_component: { label: 'Table', color: 'bg-amber-100 text-amber-700' },
    svg_diagram: { label: 'SVG', color: 'bg-cyan-100 text-cyan-700' },
    placeholder: { label: 'Placeholder', color: 'bg-gray-100 text-gray-700' },
  };

  const { label, color } = labels[mode] || labels.placeholder;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}
