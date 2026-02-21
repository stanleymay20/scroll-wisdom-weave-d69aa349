/**
 * Mini 6-axis Bloom Radar — lightweight SVG visualization
 */

import { motion } from "framer-motion";

const LABELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
const ANGLES = LABELS.map((_, i) => (Math.PI * 2 * i) / 6 - Math.PI / 2);

function pointOnCircle(angle: number, r: number, cx: number, cy: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

interface MiniRadarChartProps {
  /** Values 0-100 for each Bloom level */
  values: number[];
  size?: number;
  animate?: boolean;
}

export function MiniRadarChart({ values, size = 180, animate = true }: MiniRadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;

  const gridLevels = [0.25, 0.5, 0.75, 1];

  const dataPoints = ANGLES.map((angle, i) => {
    const r = (values[i] / 100) * maxR;
    return pointOnCircle(angle, r, cx, cy);
  });

  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* Grid */}
      {gridLevels.map((level) => {
        const points = ANGLES.map((a) => pointOnCircle(a, maxR * level, cx, cy));
        const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
        return <path key={level} d={path} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.4} />;
      })}

      {/* Axes */}
      {ANGLES.map((angle, i) => {
        const end = pointOnCircle(angle, maxR, cx, cy);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="hsl(var(--border))" strokeWidth={0.5} opacity={0.3} />;
      })}

      {/* Data area */}
      {animate ? (
        <motion.path
          d={dataPath}
          fill="hsl(var(--primary) / 0.2)"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      ) : (
        <path d={dataPath} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth={2} />
      )}

      {/* Labels */}
      {ANGLES.map((angle, i) => {
        const labelR = maxR + 16;
        const p = pointOnCircle(angle, labelR, cx, cy);
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground"
            fontSize={9}
            fontWeight={values[i] > 0 ? 600 : 400}
          >
            {LABELS[i]}
          </text>
        );
      })}
    </svg>
  );
}
