/**
 * ComparisonTable — Renders comparison/step-by-step figures as structured tables
 * ==============================================================================
 * Used by FigureRenderer when renderMode === 'table_component'
 */

import { memo, useMemo } from 'react';
import { ArrowRight, Check } from 'lucide-react';

interface ComparisonTableProps {
  description: string;
  visualType: string;
  caption: string;
  className?: string;
}

interface TableRow {
  label: string;
  detail: string;
  stepNumber?: number;
}

function parseDescriptionToRows(description: string, visualType: string): TableRow[] {
  const lines = description
    .split(/[.;\n]/)
    .map(l => l.trim())
    .filter(l => l.length > 3);

  const isStepByStep = visualType === 'step_by_step';

  return lines.slice(0, 10).map((line, i) => {
    // Try to split on colon for label:detail
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      return {
        label: line.substring(0, colonIdx).trim(),
        detail: line.substring(colonIdx + 1).trim(),
        stepNumber: isStepByStep ? i + 1 : undefined,
      };
    }

    // Try "vs" split for comparisons
    const vsIdx = line.toLowerCase().indexOf(' vs ');
    if (vsIdx > 0) {
      return {
        label: line.substring(0, vsIdx).trim(),
        detail: line.substring(vsIdx + 4).trim(),
      };
    }

    return {
      label: isStepByStep ? `Step ${i + 1}` : `Item ${i + 1}`,
      detail: line,
      stepNumber: isStepByStep ? i + 1 : undefined,
    };
  });
}

export const ComparisonTable = memo(function ComparisonTable({
  description,
  visualType,
  caption,
  className = '',
}: ComparisonTableProps) {
  const rows = useMemo(() => parseDescriptionToRows(description, visualType), [description, visualType]);
  const isStepByStep = visualType === 'step_by_step';

  if (rows.length === 0) {
    return (
      <div className={`bg-muted/30 border border-border rounded-lg p-6 text-center ${className}`}>
        <p className="text-sm text-muted-foreground italic">{description}</p>
      </div>
    );
  }

  return (
    <div className={`bg-card border border-border rounded-lg overflow-hidden ${className}`}>
      <div className="px-4 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {isStepByStep ? 'Step-by-Step Process' : 'Comparison'}
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            {/* Step number or bullet */}
            <div className="flex-shrink-0 mt-0.5">
              {isStepByStep ? (
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {row.stepNumber}
                </div>
              ) : (
                <Check className="h-4 w-4 text-primary mt-0.5" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground">
                {row.label}
              </div>
              {row.detail && row.detail !== row.label && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {row.detail}
                </div>
              )}
            </div>

            {/* Arrow for steps */}
            {isStepByStep && i < rows.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 mt-1.5" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
