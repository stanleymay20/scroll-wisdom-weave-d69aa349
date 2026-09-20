/**
 * StructuredFigure — draws a figure from its data, not from its prose.
 *
 * The other components in this folder reconstruct a diagram by splitting the
 * figure's DESCRIPTION on full stops and treating each fragment as a node, a
 * bar or a row. That was the only option when a figure carried nothing but
 * prose. A figure that carries a DATA payload has the real structure, so it is
 * drawn from that instead.
 *
 * Geometry comes from the same module the PDF and the EPUB use
 * (supabase/functions/_shared/figure-layout.ts), imported rather than copied.
 * A reader who sees a diagram on screen and then downloads the book should get
 * the same diagram, and the surest way to guarantee that is one implementation
 * of the arithmetic.
 *
 * The SVG is emitted as React elements rather than injected as markup, so no
 * string of generated HTML is ever handed to dangerouslySetInnerHTML.
 */

import { memo, useId, useMemo } from "react";
import type { FigureData } from "../../../../supabase/functions/_shared/figure-data";
import { figureDataToTable } from "../../../../supabase/functions/_shared/figure-data";
import { layoutFigure } from "../../../../supabase/functions/_shared/figure-layout";

interface StructuredFigureProps {
  data: FigureData;
  caption: string;
  description: string;
  className?: string;
}

/** Nominal layout width; the SVG scales to its container via the viewBox. */
const LAYOUT_WIDTH = 400;
const NODE_LINE_HEIGHT = 11;

function DataTable({ data }: { data: FigureData }) {
  const { header, rows } = useMemo(() => figureDataToTable(data), [data]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border border-border bg-muted/50 px-3 py-2 text-left font-semibold"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r % 2 === 1 ? "bg-muted/20" : undefined}>
              {header.map((_, c) => (
                <td key={c} className="border border-border px-3 py-2 align-top">
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const StructuredFigure = memo(function StructuredFigure({
  data,
  caption,
  description,
  className = "",
}: StructuredFigureProps) {
  // Unique per instance: two diagrams on one page would otherwise both define
  // an arrowhead marker with the same id, and the second would win for both.
  const rawId = useId();
  const arrowId = `fig-arrow-${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`;

  const layout = useMemo(() => layoutFigure(data, LAYOUT_WIDTH), [data]);

  // Tables are tables in every format. An HTML table is more readable, more
  // selectable and more accessible than the same grid drawn as vectors.
  if (!layout) {
    return (
      <div className={className}>
        <DataTable data={data} />
      </div>
    );
  }

  const lane = Math.max(
    layout.width,
    ...layout.arrows.flatMap((a) => a.points.map((p) => p.x)),
  );
  const pad = 4;
  const viewWidth = Math.ceil(lane + pad * 2);
  const viewHeight = Math.ceil(layout.height + pad * 2);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width="100%"
        role="img"
        aria-label={caption}
        className="max-w-2xl mx-auto"
      >
        <title>{caption}</title>
        <desc>{description}</desc>
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        <g transform={`translate(${pad},${pad})`}>
          {layout.arrows.map((arrow, i) => (
            <g key={`arrow-${i}`}>
              <polyline
                points={arrow.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                strokeWidth={1.2}
                className="stroke-muted-foreground"
                markerEnd={`url(#${arrowId})`}
              />
              {arrow.label ? (
                <text
                  x={arrow.points[Math.floor(arrow.points.length / 2)].x + 4}
                  y={arrow.points[Math.floor(arrow.points.length / 2)].y - 3}
                  fontSize={8}
                  className="fill-muted-foreground"
                >
                  {arrow.label}
                </text>
              ) : null}
            </g>
          ))}

          {layout.boxes.map((box, i) => {
            const blockHeight = box.text.lines.length * NODE_LINE_HEIGHT;
            const firstBaseline = box.y + (box.height - blockHeight) / 2 + box.text.size;
            return (
              <g key={`box-${i}`}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={box.shape === "round" ? Math.min(12, box.height / 2) : 3}
                  className="fill-muted/40 stroke-border"
                  strokeWidth={1}
                />
                {box.text.lines.map((line, l) => (
                  <text
                    key={l}
                    x={box.x + box.width / 2}
                    y={firstBaseline + l * NODE_LINE_HEIGHT}
                    textAnchor="middle"
                    fontSize={box.text.size}
                    className="fill-foreground"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {layout.axisX !== undefined && layout.bars.length > 0 ? (
            <>
              <line
                x1={layout.axisX}
                y1={0}
                x2={layout.axisX}
                y2={layout.height}
                strokeWidth={1}
                className="stroke-border"
              />
              {layout.bars.map((bar, i) => (
                <g key={`bar-${i}`}>
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    className="fill-primary"
                  />
                  <text
                    x={layout.axisX! - 6}
                    y={bar.labelY + 3}
                    textAnchor="end"
                    fontSize={9}
                    className="fill-foreground"
                  >
                    {bar.label}
                  </text>
                  <text
                    x={bar.x + bar.width + 4}
                    y={bar.labelY + 3}
                    fontSize={9}
                    className="fill-muted-foreground"
                  >
                    {bar.value}
                  </text>
                </g>
              ))}
            </>
          ) : null}
        </g>
      </svg>
    </div>
  );
});
