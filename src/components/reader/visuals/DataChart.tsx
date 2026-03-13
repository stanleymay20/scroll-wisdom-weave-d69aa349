/**
 * DataChart — Renders chart/matrix figures using Recharts
 * ========================================================
 * Used by FigureRenderer when renderMode === 'chart_component'
 * Parses figure descriptions into visualizable data structures.
 */

import { memo, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Cell,
} from 'recharts';

interface DataChartProps {
  description: string;
  visualType: string;
  caption: string;
  className?: string;
}

interface ChartDataPoint {
  name: string;
  value: number;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 70%, 55%)',
  'hsl(180, 50%, 45%)',
];

/**
 * Extract structured data from a figure description.
 * Looks for patterns like "Category: value", numbered items, or bullet points.
 */
function parseDescriptionToData(description: string): ChartDataPoint[] {
  const lines = description
    .split(/[.;\n]/)
    .map(l => l.trim())
    .filter(l => l.length > 2);

  // Try "Label: Number" pattern
  const colonPattern = lines
    .map(l => {
      const match = l.match(/^(.+?):\s*(\d+(?:\.\d+)?)/);
      if (match) return { name: match[1].trim().substring(0, 20), value: parseFloat(match[2]) };
      return null;
    })
    .filter(Boolean) as ChartDataPoint[];

  if (colonPattern.length >= 2) return colonPattern;

  // Try extracting numbers from text
  const withNumbers = lines
    .map(l => {
      const numMatch = l.match(/(\d+(?:\.\d+)?)\s*%?/);
      if (numMatch) {
        const label = l.replace(numMatch[0], '').replace(/[,:\-–—]/g, '').trim();
        return { name: label.substring(0, 20) || 'Item', value: parseFloat(numMatch[1]) };
      }
      return null;
    })
    .filter(Boolean) as ChartDataPoint[];

  if (withNumbers.length >= 2) return withNumbers;

  // Fallback: treat each line as equal-weight item
  return lines.slice(0, 8).map((line, i) => ({
    name: line.substring(0, 20),
    value: 10 - i, // descending importance
  }));
}

export const DataChart = memo(function DataChart({
  description,
  visualType,
  caption,
  className = '',
}: DataChartProps) {
  const data = useMemo(() => parseDescriptionToData(description), [description]);

  const isRadar = visualType === 'matrix' || data.length >= 4;

  if (data.length === 0) {
    return (
      <div className={`bg-muted/30 border border-border rounded-lg p-6 text-center ${className}`}>
        <p className="text-sm text-muted-foreground italic">{description}</p>
      </div>
    );
  }

  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <div className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
        {visualType.replace(/_/g, ' ')}
      </div>
      <ResponsiveContainer width="100%" height={Math.min(300, 50 + data.length * 35)}>
        {isRadar && data.length >= 3 ? (
          <RadarChart data={data}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Radar
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        ) : (
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={80}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
});
