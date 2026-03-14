import { memo, useMemo, Component, type ReactNode } from "react";
import { MermaidDiagram, descriptionToMermaid } from "./visuals/MermaidDiagram";
import { DataChart } from "./visuals/DataChart";
import { ComparisonTable } from "./visuals/ComparisonTable";

// ===========================================
// SCROLLLIBRARY FIGURE RENDERER LIBRARY v2.0
// Maps visual types to live rendering components
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
 * ErrorFallback — Catches render failures and shows caption + description
 * instead of a broken UI. Uses React error boundary pattern.
 */
interface ErrorFallbackProps {
  children: ReactNode;
  fallbackCaption: string;
  fallbackDescription: string;
  visualType: string;
}

interface ErrorFallbackState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorFallback extends Component<ErrorFallbackProps, ErrorFallbackState> {
  state: ErrorFallbackState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): ErrorFallbackState {
    return { hasError: true, errorMessage: error.message || 'Render failed' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-muted/20 border border-dashed border-border rounded-lg p-4 text-center">
          <div className="text-xs text-muted-foreground/60 mb-1 font-mono">
            {this.props.visualType.replace(/_/g, ' ')} — fallback
          </div>
          <p className="text-sm text-muted-foreground">
            {this.props.fallbackCaption}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {this.props.fallbackDescription}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * FigureRenderer v2.0 — Live rendering through the correct component path.
 *
 * - ai_image:        AI-generated image (children, comic, fiction, workbook)
 * - mermaid:          Live Mermaid diagram (flowchart, tree, lifecycle, architecture, concept_map)
 * - chart_component:  Recharts visualization (matrix, chart)
 * - table_component:  Structured comparison/step-by-step table
 * - svg_diagram:      SVG placeholder (future)
 * - placeholder:      Caption-only fallback
 *
 * Every mode has built-in error recovery: on failure, shows caption + description
 * instead of broken UI.
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

    switch (renderMode) {
      case 'mermaid': {
        const mermaidDef = descriptionToMermaid(description, visualType);
        return (
          <ErrorFallback
            fallbackCaption={caption}
            fallbackDescription={description}
            visualType={visualType}
          >
            <MermaidDiagram definition={mermaidDef} className="min-h-[120px]" />
          </ErrorFallback>
        );
      }

      case 'chart_component':
        return (
          <ErrorFallback
            fallbackCaption={caption}
            fallbackDescription={description}
            visualType={visualType}
          >
            <DataChart
              description={description}
              visualType={visualType}
              caption={caption}
            />
          </ErrorFallback>
        );

      case 'table_component':
        return (
          <ErrorFallback
            fallbackCaption={caption}
            fallbackDescription={description}
            visualType={visualType}
          >
            <ComparisonTable
              description={description}
              visualType={visualType}
              caption={caption}
            />
          </ErrorFallback>
        );

      case 'svg_diagram':
        return (
          <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
            <div className="text-xs text-muted-foreground mb-2 font-mono">
              SVG: {visualType.replace(/_/g, ' ')}
            </div>
            <p className="text-sm text-muted-foreground italic">{description}</p>
          </div>
        );

      case 'ai_image':
        // AI image mode without a URL — show structured placeholder
        return (
          <div className="bg-muted/20 border border-dashed border-border rounded-lg p-5 text-center">
            <div className="text-xs text-muted-foreground/60 mb-1 font-mono uppercase tracking-wider">
              {visualType.replace(/_/g, ' ')}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
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
    ai_image: { label: 'AI Image', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    mermaid: { label: 'Mermaid', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    chart_component: { label: 'Chart', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    table_component: { label: 'Table', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    svg_diagram: { label: 'SVG', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
    placeholder: { label: 'Placeholder', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300' },
  };

  const { label, color } = labels[mode] || labels.placeholder;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}
