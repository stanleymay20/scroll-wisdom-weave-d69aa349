import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { FigureData, FlowData } from "./figure-data.ts";
import {
  assignLayers,
  escapeXml,
  figureLayoutToSvg,
  layoutFigure,
  measureTextWidth,
  wrapLabel,
  type FigureLayout,
} from "./figure-layout.ts";

const WIDTH = 400;

function flow(nodes: string[], edges: Array<[string, string, string?]>, direction: "down" | "right" = "down"): FlowData {
  return {
    kind: "flow",
    direction,
    nodes: nodes.map((id) => ({ id, label: `Node ${id}`, shape: "box" })),
    edges: edges.map(([from, to, label]) => (label ? { from, to, label } : { from, to })),
  };
}

function mustLayout(data: FigureData, width = WIDTH): FigureLayout {
  const layout = layoutFigure(data, width);
  assert(layout, "expected a layout");
  return layout;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// ---------------------------------------------------------------------------
// wrapLabel — a label that overruns its box makes the figure unreadable in
// every format at once, so fitting is the property, not prettiness.
// ---------------------------------------------------------------------------

Deno.test("wrapped lines fit the width they were given", () => {
  const lines = wrapLabel("Submission enters triage and awaits reviewer assignment", 120, 9, 3);
  assert(lines.length <= 3);
  for (const line of lines) {
    assert(measureTextWidth(line, 9) <= 120 * 1.05, `"${line}" overruns`);
  }
});

Deno.test("a single unbreakable word is clipped to fit", () => {
  const lines = wrapLabel("Supercalifragilisticexpialidociousness", 60, 9, 2);
  assertEquals(lines.length, 1);
  assert(measureTextWidth(lines[0], 9) <= 60 * 1.05, lines[0]);
  assert(lines[0].endsWith("…"), lines[0]);
});

Deno.test("truncation past maxLines is marked", () => {
  const lines = wrapLabel("one two three four five six seven eight nine ten eleven twelve", 60, 9, 2);
  assertEquals(lines.length, 2);
  assert(lines[lines.length - 1].endsWith("…"), lines.join(" | "));
});

Deno.test("a short label is not marked as truncated", () => {
  const lines = wrapLabel("Triage", 120, 9, 3);
  assertEquals(lines, ["Triage"]);
});

Deno.test("an empty label yields one empty line rather than nothing", () => {
  assertEquals(wrapLabel("   ", 100, 9, 3), [""]);
});

// ---------------------------------------------------------------------------
// assignLayers — longest path, because a node reachable both directly and via
// three steps belongs below all of them or its arrow points back up the page.
// ---------------------------------------------------------------------------

Deno.test("a chain descends one layer at a time", () => {
  const layers = assignLayers(flow(["a", "b", "c"], [["a", "b"], ["b", "c"]]));
  assertEquals(layers.get("a"), 0);
  assertEquals(layers.get("b"), 1);
  assertEquals(layers.get("c"), 2);
});

Deno.test("a shortcut does not pull a node up the page", () => {
  // a->b->c->d and a->d. Shortest path would put d at layer 1, above c, and
  // its incoming arrow from c would run backwards.
  const layers = assignLayers(flow(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "d"], ["a", "d"]]));
  assertEquals(layers.get("d"), 3);
  assert((layers.get("d") ?? 0) > (layers.get("c") ?? 0), "d must sit below c");
});

Deno.test("a branch puts siblings on the same layer", () => {
  const layers = assignLayers(flow(["root", "x", "y"], [["root", "x"], ["root", "y"]]));
  assertEquals(layers.get("x"), layers.get("y"));
});

Deno.test("a pure cycle terminates and is laid out", () => {
  // No root exists, so the walk must not depend on finding one.
  const layers = assignLayers(flow(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]));
  assertEquals(layers.size, 3);
  assertEquals(layers.get("a"), 0);
});

Deno.test("a self-contained loop inside a chain terminates", () => {
  const layers = assignLayers(flow(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "b"], ["c", "d"]]));
  assertEquals(layers.size, 4);
  assert(Number.isFinite(layers.get("d")));
});

// ---------------------------------------------------------------------------
// layoutFlow
// ---------------------------------------------------------------------------

Deno.test("boxes never overlap each other", () => {
  const layout = mustLayout(flow(
    ["a", "b", "c", "d", "e"],
    [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["d", "e"]],
  ));
  for (let i = 0; i < layout.boxes.length; i++) {
    for (let j = i + 1; j < layout.boxes.length; j++) {
      assert(!overlaps(layout.boxes[i], layout.boxes[j]), `box ${i} overlaps box ${j}`);
    }
  }
});

Deno.test("boxes stay inside the given width", () => {
  const layout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["a", "c"]]));
  for (const box of layout.boxes) {
    assert(box.x >= 0, `negative x: ${box.x}`);
    assert(box.x + box.width <= WIDTH + 0.5, `${box.x + box.width} exceeds ${WIDTH}`);
  }
});

Deno.test("the reported height covers every box", () => {
  const layout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"]]));
  const lowest = Math.max(...layout.boxes.map((b) => b.y + b.height));
  assertEquals(Math.round(layout.height), Math.round(lowest));
});

Deno.test("siblings share a layer height so the row reads as one band", () => {
  const data: FlowData = {
    kind: "flow",
    direction: "down",
    nodes: [
      { id: "r", label: "Root" },
      { id: "a", label: "Short" },
      { id: "b", label: "A considerably longer label that will wrap onto several lines" },
    ],
    edges: [{ from: "r", to: "a" }, { from: "r", to: "b" }],
  };
  const layout = mustLayout(data);
  const siblings = layout.boxes.filter((b) => b.y === layout.boxes[1].y);
  assertEquals(siblings.length, 2);
  assertEquals(siblings[0].height, siblings[1].height);
});

Deno.test("every edge produces an arrow with at least two points", () => {
  const layout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"]]));
  assertEquals(layout.arrows.length, 2);
  for (const arrow of layout.arrows) {
    assert(arrow.points.length >= 2, "an arrow needs a start and an end");
  }
});

Deno.test("a forward arrow leaves a box's bottom and enters the next box's top", () => {
  const layout = mustLayout(flow(["a", "b"], [["a", "b"]]));
  const [from, to] = layout.boxes;
  const arrow = layout.arrows[0];
  assertEquals(arrow.points[0].y, from.y + from.height);
  assertEquals(arrow.points[arrow.points.length - 1].y, to.y);
});

Deno.test("a back edge is routed outside the boxes it passes", () => {
  const layout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]));
  const back = layout.arrows[2];
  const lane = Math.max(...back.points.map((p) => p.x));
  for (const box of layout.boxes) {
    assert(lane >= box.x + box.width, "the return lane must clear every box");
  }
});

Deno.test("an edge label is carried onto its arrow", () => {
  const layout = mustLayout(flow(["a", "b"], [["a", "b", "if approved"]]));
  assertEquals(layout.arrows[0].label, "if approved");
});

Deno.test("a single node lays out without arrows", () => {
  const layout = mustLayout({
    kind: "flow",
    direction: "down",
    nodes: [{ id: "a", label: "The whole idea" }],
    edges: [],
  });
  assertEquals(layout.boxes.length, 1);
  assertEquals(layout.arrows.length, 0);
  assert(layout.height > 0);
});

Deno.test("a narrow width still produces usable boxes", () => {
  const layout = mustLayout(flow(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["a", "d"]]), 120);
  for (const box of layout.boxes) {
    assert(box.width >= 60, `box collapsed to ${box.width}`);
    assert(box.height > 0);
  }
});

// ---------------------------------------------------------------------------
// layoutSeries
// ---------------------------------------------------------------------------

const SERIES: FigureData = {
  kind: "series",
  unit: "%",
  points: [{ label: "Agree", value: 60 }, { label: "Neutral", value: 30 }, { label: "Disagree", value: 10 }],
};

Deno.test("bar lengths are proportional to their values", () => {
  const layout = mustLayout(SERIES);
  const [a, b, c] = layout.bars;
  // 60 : 30 : 10 — the ratios must survive scaling.
  assert(Math.abs(a.width / b.width - 2) < 0.01, `${a.width} / ${b.width}`);
  assert(Math.abs(a.width / c.width - 6) < 0.01, `${a.width} / ${c.width}`);
});

Deno.test("the longest bar fills the track and none overflow", () => {
  const layout = mustLayout(SERIES);
  for (const bar of layout.bars) {
    assert(bar.x + bar.width <= WIDTH + 0.5, `bar overruns: ${bar.x + bar.width}`);
  }
  const longest = Math.max(...layout.bars.map((b) => b.x + b.width));
  assertEquals(Math.round(longest), WIDTH);
});

Deno.test("bars do not overlap and are ordered as given", () => {
  const layout = mustLayout(SERIES);
  for (let i = 1; i < layout.bars.length; i++) {
    assert(layout.bars[i].y >= layout.bars[i - 1].y + layout.bars[i - 1].height, "bars collide");
  }
  assertEquals(layout.bars.map((b) => b.label), ["Agree", "Neutral", "Disagree"]);
});

Deno.test("labels are given room to the left of the axis", () => {
  const layout = mustLayout(SERIES);
  assert(layout.axisX !== undefined && layout.axisX > 0);
  for (const bar of layout.bars) {
    assertEquals(bar.x, layout.axisX);
    assert(bar.labelX < layout.axisX, "the label must sit left of the axis");
  }
});

Deno.test("all-zero values do not produce a NaN width", () => {
  const layout = mustLayout({
    kind: "series",
    points: [{ label: "A", value: 0 }, { label: "B", value: 0 }],
  });
  for (const bar of layout.bars) {
    assert(Number.isFinite(bar.width), `width was ${bar.width}`);
    assert(bar.width >= 0);
  }
});

Deno.test("negative values scale against their own magnitude", () => {
  const layout = mustLayout({
    kind: "series",
    points: [{ label: "Down", value: -40 }, { label: "Up", value: 20 }],
  });
  for (const bar of layout.bars) {
    assert(Number.isFinite(bar.width) && bar.width > 0, `width was ${bar.width}`);
    assert(bar.x + bar.width <= WIDTH + 0.5);
  }
  assert(layout.bars[0].width > layout.bars[1].width, "the larger magnitude draws longer");
});

// ---------------------------------------------------------------------------
// Tables take the native path in every format, so they get no geometry.
// ---------------------------------------------------------------------------

Deno.test("a table has no drawn layout", () => {
  assertEquals(
    layoutFigure({ kind: "table", columns: ["A", "B"], rows: [["1", "2"]] }, WIDTH),
    null,
  );
});

// ---------------------------------------------------------------------------
// SVG — embedded in EPUBs, where none of the reader's CSS is in scope.
// ---------------------------------------------------------------------------

/**
 * Minimal XML well-formedness check.
 *
 * An EPUB is XHTML and EPUBCheck rejects the whole book over one unbalanced
 * tag, so this asserts the property that matters rather than trusting the
 * emitter. Deno ships no DOMParser, and pulling one in would put a remote
 * import into a test that must run in CI, so the subset we emit is checked
 * directly: balanced elements, quoted attributes, nothing stray.
 */
function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      assert(!xml.slice(i).includes(">"), `stray '>' in text at ${i}`);
      break;
    }
    assert(!xml.slice(i, lt).includes(">"), `stray '>' in text before ${lt}`);

    // Find the tag's end, skipping any '>' that sits inside an attribute value.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < xml.length) {
      const ch = xml[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j++;
    }
    assert(j < xml.length, `unterminated tag at ${lt}`);
    assert(quote === null, `unterminated attribute value at ${lt}`);

    const body = xml.slice(lt + 1, j);
    if (body.startsWith("?") || body.startsWith("!")) { i = j + 1; continue; }

    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      assertEquals(stack.pop(), name, `mismatched closing </${name}>`);
    } else if (!body.endsWith("/")) {
      stack.push(body.split(/[\s>]/)[0]);
    }
    i = j + 1;
  }
  assertEquals(stack, [], `unclosed elements: ${stack.join(", ")}`);
}

Deno.test("svg is well-formed XML", () => {
  const svg = figureLayoutToSvg(mustLayout(flow(["a", "b"], [["a", "b", "then"]])), {
    title: "The review lifecycle",
    description: "A flowchart of the review process.",
  });
  assertWellFormedXml(svg);
  assertStringIncludes(svg, "<title>The review lifecycle</title>");
});

Deno.test("svg for every figure kind is well-formed", () => {
  assertWellFormedXml(figureLayoutToSvg(mustLayout(SERIES)));
  assertWellFormedXml(figureLayoutToSvg(mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]))));
  assertWellFormedXml(figureLayoutToSvg(mustLayout({
    kind: "flow",
    direction: "down",
    nodes: [{ id: "a", label: "Solo & <alone>" }],
    edges: [],
  })));
});

Deno.test("the well-formedness check rejects broken markup", () => {
  // Guards the guard: a check that passes everything proves nothing.
  let threw = false;
  try { assertWellFormedXml("<svg><rect></svg>"); } catch { threw = true; }
  assert(threw, "unbalanced tags must be rejected");
});

Deno.test("svg carries an accessible name", () => {
  const svg = figureLayoutToSvg(mustLayout(SERIES), { title: "Agreement by group" });
  assertStringIncludes(svg, 'role="img"');
  assertStringIncludes(svg, 'aria-label="Agreement by group"');
});

Deno.test("svg uses literal colours, not CSS variables", () => {
  // An EPUB reader has none of the app's stylesheets, so hsl(var(--primary))
  // would render as nothing at all.
  const svg = figureLayoutToSvg(mustLayout(SERIES));
  assert(!svg.includes("var(--"), "no CSS custom properties may appear");
});

Deno.test("markup in a label cannot escape into the svg", () => {
  const layout = mustLayout({
    kind: "flow",
    direction: "down",
    nodes: [{ id: "a", label: '</text><script>alert(1)</script>' }],
    edges: [],
  });
  const svg = figureLayoutToSvg(layout, { title: '"><script>x</script>' });
  assert(!svg.includes("<script>"), svg);
  assertStringIncludes(svg, "&lt;/text&gt;");
});

Deno.test("escapeXml covers the five predefined entities", () => {
  assertEquals(escapeXml(`<&>"'`), "&lt;&amp;&gt;&quot;&apos;");
});

Deno.test("the viewBox includes a back edge's return lane", () => {
  // The lane is routed just outside the content width; a viewBox of exactly
  // that width would clip the arrow that closes the cycle.
  const layout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]));
  const svg = figureLayoutToSvg(layout);
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  assert(viewBox, "viewBox missing");
  const lane = Math.max(...layout.arrows.flatMap((a) => a.points.map((p) => p.x)));
  assert(Number(viewBox[1]) >= lane, `viewBox ${viewBox[1]} clips lane at ${lane}`);
});

Deno.test("every box and bar appears in the svg", () => {
  const flowLayout = mustLayout(flow(["a", "b", "c"], [["a", "b"], ["b", "c"]]));
  const flowSvg = figureLayoutToSvg(flowLayout);
  assertEquals((flowSvg.match(/<rect /g) || []).length, flowLayout.boxes.length);

  const seriesLayout = mustLayout(SERIES);
  const seriesSvg = figureLayoutToSvg(seriesLayout);
  assertEquals((seriesSvg.match(/<rect /g) || []).length, seriesLayout.bars.length);
});
