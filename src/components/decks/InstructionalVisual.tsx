/**
 * InstructionalVisual – SVG-based instructional visuals for learning deck slides.
 * Renders real diagrams/charts/flows when AI image generation is unavailable.
 * Each layout type maps to a distinct visual pattern.
 */

import { cn } from '@/lib/utils';

interface InstructionalVisualProps {
  layout: string;
  heading: string;
  content: string[];
  visualType?: string;
  visualDescription?: string;
  className?: string;
}

export function InstructionalVisual({
  layout,
  heading,
  content,
  visualType,
  visualDescription,
  className,
}: InstructionalVisualProps) {
  const Renderer = LAYOUT_VISUALS[layout] || ConceptMapVisual;

  return (
    <div className={cn(
      'w-full rounded-xl overflow-hidden border bg-card shadow-sm p-4',
      className
    )}>
      <Renderer heading={heading} content={content} />
    </div>
  );
}

// ─── Visual Renderers ───────────────────────────────────────

interface VisualProps {
  heading: string;
  content: string[];
}

/** Step flow – used for example-walkthrough */
function StepFlowVisual({ content }: VisualProps) {
  const steps = content.slice(0, 5);
  const stepH = 44;
  const gap = 20;
  const svgH = steps.length * (stepH + gap);

  return (
    <svg viewBox={`0 0 320 ${svgH}`} className="w-full h-auto" role="img" aria-label="Step flow diagram">
      {steps.map((step, i) => {
        const y = i * (stepH + gap);
        return (
          <g key={i}>
            {/* Connector arrow */}
            {i > 0 && (
              <line
                x1="160" y1={y - gap + 2} x2="160" y2={y - 2}
                stroke="hsl(var(--primary))" strokeWidth="2" markerEnd="url(#arrowhead)"
              />
            )}
            {/* Step box */}
            <rect x="20" y={y} width="280" height={stepH} rx="10"
              fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1.5"
            />
            {/* Step number */}
            <circle cx="44" cy={y + stepH / 2} r="12"
              fill="hsl(var(--primary))" />
            <text x="44" y={y + stepH / 2 + 5} textAnchor="middle"
              fill="white" fontSize="12" fontWeight="700">
              {i + 1}
            </text>
            {/* Step text */}
            <text x="66" y={y + stepH / 2 + 5} fontSize="12" fill="hsl(var(--foreground))">
              {step.length > 40 ? step.slice(0, 40) + '…' : step}
            </text>
          </g>
        );
      })}
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--primary))" />
        </marker>
      </defs>
    </svg>
  );
}

/** Comparison chart – two-column layout */
function ComparisonVisual({ content }: VisualProps) {
  const half = Math.ceil(content.length / 2);
  const left = content.slice(0, half);
  const right = content.slice(half);
  const rows = Math.max(left.length, right.length);
  const rowH = 40;
  const headerH = 36;
  const svgH = headerH + rows * rowH + 16;

  return (
    <svg viewBox={`0 0 320 ${svgH}`} className="w-full h-auto" role="img" aria-label="Comparison chart">
      {/* Headers */}
      <rect x="4" y="0" width="152" height={headerH} rx="8"
        fill="hsl(var(--primary) / 0.15)" />
      <text x="80" y={headerH / 2 + 5} textAnchor="middle"
        fontSize="12" fontWeight="700" fill="hsl(var(--primary))">
        Option A
      </text>
      <rect x="164" y="0" width="152" height={headerH} rx="8"
        fill="hsl(210 60% 50% / 0.15)" />
      <text x="240" y={headerH / 2 + 5} textAnchor="middle"
        fontSize="12" fontWeight="700" fill="hsl(210 60% 50%)">
        Option B
      </text>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => {
        const y = headerH + 8 + i * rowH;
        return (
          <g key={i}>
            <rect x="4" y={y} width="152" height={rowH - 4} rx="6"
              fill="hsl(var(--muted) / 0.4)" />
            <text x="14" y={y + rowH / 2} fontSize="11" fill="hsl(var(--foreground))">
              {left[i] ? (left[i].length > 20 ? left[i].slice(0, 20) + '…' : left[i]) : ''}
            </text>
            <rect x="164" y={y} width="152" height={rowH - 4} rx="6"
              fill="hsl(var(--muted) / 0.4)" />
            <text x="174" y={y + rowH / 2} fontSize="11" fill="hsl(var(--foreground))">
              {right[i] ? (right[i].length > 20 ? right[i].slice(0, 20) + '…' : right[i]) : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Concept map – hub-and-spoke for concept-visual / diagram-focus */
function ConceptMapVisual({ heading, content }: VisualProps) {
  const items = content.slice(0, 5);
  const cx = 160;
  const cy = 110;
  const radius = 80;

  return (
    <svg viewBox="0 0 320 220" className="w-full h-auto" role="img" aria-label="Concept map">
      {/* Spokes */}
      {items.map((_, i) => {
        const angle = (2 * Math.PI * i) / items.length - Math.PI / 2;
        const ex = cx + radius * Math.cos(angle);
        const ey = cy + radius * Math.sin(angle);
        return (
          <line key={`l-${i}`} x1={cx} y1={cy} x2={ex} y2={ey}
            stroke="hsl(var(--primary) / 0.25)" strokeWidth="2" />
        );
      })}
      {/* Central hub */}
      <circle cx={cx} cy={cy} r="32" fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary))" strokeWidth="2" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="hsl(var(--primary))">
        {heading.length > 14 ? heading.slice(0, 14) + '…' : heading}
      </text>
      {/* Satellite nodes */}
      {items.map((item, i) => {
        const angle = (2 * Math.PI * i) / items.length - Math.PI / 2;
        const nx = cx + radius * Math.cos(angle);
        const ny = cy + radius * Math.sin(angle);
        const label = item.length > 18 ? item.slice(0, 18) + '…' : item;
        return (
          <g key={i}>
            <rect x={nx - 45} y={ny - 14} width="90" height="28" rx="14"
              fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
            <text x={nx} y={ny + 4} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Objectives checklist – for learning-objectives */
function ObjectivesVisual({ content }: VisualProps) {
  const items = content.slice(0, 5);
  const rowH = 38;
  const svgH = items.length * rowH + 8;

  return (
    <svg viewBox={`0 0 320 ${svgH}`} className="w-full h-auto" role="img" aria-label="Learning objectives checklist">
      {items.map((item, i) => {
        const y = i * rowH + 4;
        return (
          <g key={i}>
            <rect x="4" y={y} width="312" height={rowH - 6} rx="8"
              fill="hsl(var(--primary) / 0.05)" stroke="hsl(var(--primary) / 0.15)" strokeWidth="1" />
            {/* Checkbox */}
            <rect x="14" y={y + 8} width="18" height="18" rx="4"
              fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
            <polyline
              points="4,9 8,14 14,4"
              stroke="hsl(var(--primary))" strokeWidth="2" fill="none"
              transform={`translate(14, ${y + 8})`}
            />
            <text x="42" y={y + rowH / 2 + 1} fontSize="11" fill="hsl(var(--foreground))">
              {item.length > 42 ? item.slice(0, 42) + '…' : item}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Summary / key takeaways – icon-based */
function SummaryVisual({ content }: VisualProps) {
  const items = content.slice(0, 5);
  const rowH = 42;
  const svgH = items.length * rowH + 8;
  const icons = ['★', '◆', '●', '▲', '■'];

  return (
    <svg viewBox={`0 0 320 ${svgH}`} className="w-full h-auto" role="img" aria-label="Key takeaways">
      {items.map((item, i) => {
        const y = i * rowH + 4;
        return (
          <g key={i}>
            <rect x="4" y={y} width="312" height={rowH - 6} rx="10"
              fill={`hsl(var(--primary) / ${0.04 + i * 0.02})`}
              stroke="hsl(var(--primary) / 0.2)" strokeWidth="1" />
            <text x="22" y={y + rowH / 2 + 2} fontSize="16" fill="hsl(var(--primary))">
              {icons[i % icons.length]}
            </text>
            <text x="44" y={y + rowH / 2 + 2} fontSize="11" fill="hsl(var(--foreground))">
              {item.length > 40 ? item.slice(0, 40) + '…' : item}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Title visual – book/deck title card */
function TitleVisual({ heading }: VisualProps) {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-auto" role="img" aria-label="Title card">
      {/* Background gradient */}
      <defs>
        <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary) / 0.12)" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.04)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="180" rx="16" fill="url(#titleGrad)" />
      {/* Book icon */}
      <g transform="translate(130, 30)">
        <rect x="0" y="0" width="60" height="72" rx="4" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth="2" />
        <line x1="30" y1="0" x2="30" y2="72" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
        <rect x="10" y="14" width="40" height="4" rx="2" fill="hsl(var(--primary) / 0.3)" />
        <rect x="10" y="24" width="30" height="3" rx="1.5" fill="hsl(var(--primary) / 0.2)" />
        <rect x="10" y="32" width="36" height="3" rx="1.5" fill="hsl(var(--primary) / 0.2)" />
      </g>
      {/* Title text */}
      <text x="160" y="130" textAnchor="middle" fontSize="14" fontWeight="700" fill="hsl(var(--primary))">
        {heading.length > 30 ? heading.slice(0, 30) + '…' : heading}
      </text>
      <text x="160" y="152" textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
        Verified Learning Deck
      </text>
    </svg>
  );
}

// ─── Layout → Visual Mapping ────────────────────────────────

const LAYOUT_VISUALS: Record<string, React.FC<VisualProps>> = {
  'title-visual': TitleVisual,
  'learning-objectives': ObjectivesVisual,
  'concept-text': ConceptMapVisual,
  'concept-visual': ConceptMapVisual,
  'diagram-focus': ConceptMapVisual,
  'comparison': ComparisonVisual,
  'example-walkthrough': StepFlowVisual,
  'summary-proof': SummaryVisual,
};
