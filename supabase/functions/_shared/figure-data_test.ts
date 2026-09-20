import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  figureDataToTable,
  FIGURE_LIMITS,
  parseFigureData,
  serializeFigureData,
  validateFigureData,
  type FigureData,
} from "./figure-data.ts";

const FLOW: FigureData = {
  kind: "flow",
  direction: "down",
  nodes: [
    { id: "a", label: "Submission", shape: "box" },
    { id: "b", label: "Triage", shape: "box" },
    { id: "c", label: "Decision", shape: "box" },
  ],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "accepted" }],
};

// ---------------------------------------------------------------------------
// The contract that matters: never throw, and never vouch for a structure that
// would draw a misleading diagram.
// ---------------------------------------------------------------------------

Deno.test("malformed input returns null instead of throwing", () => {
  for (
    const bad of [
      null, undefined, "", "not json", "[]", "{", "null", "42", '"string"',
      "{}", '{"kind":"nope"}', '{"kind":"flow"}', '{"kind":"table"}', '{"kind":"series"}',
    ]
  ) {
    assertEquals(parseFigureData(bad as string), null, JSON.stringify(bad));
  }
});

Deno.test("validateFigureData tolerates hostile shapes", () => {
  for (const bad of [null, undefined, [], 0, "x", true, { kind: 42 }, { kind: "flow", nodes: "no" }]) {
    assertEquals(validateFigureData(bad), null, JSON.stringify(bad));
  }
});

Deno.test("an oversized payload is refused", () => {
  const huge = JSON.stringify({
    kind: "flow",
    nodes: Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, label: "x".repeat(60) })),
    edges: [],
  });
  assert(huge.length > FIGURE_LIMITS.maxSerializedChars);
  assertEquals(parseFigureData(huge), null);
});

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

Deno.test("a well-formed flow round-trips", () => {
  const parsed = parseFigureData(serializeFigureData(FLOW));
  assertEquals(parsed, FLOW);
});

Deno.test("an edge to a node that does not exist is dropped", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "ghost" }],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.edges.length, 1);
  assertEquals(data.edges[0], { from: "a", to: "b" });
});

Deno.test("disconnected boxes are not a diagram", () => {
  // Two or more nodes with no edges is a list wearing a diagram's clothes; it
  // reads better as prose, so the caller falls back.
  assertEquals(
    parseFigureData(JSON.stringify({
      kind: "flow",
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [],
    })),
    null,
  );
});

Deno.test("a single node needs no edges", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: [{ id: "a", label: "The whole idea" }],
    edges: [],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.nodes.length, 1);
});

Deno.test("self-edges and duplicates are dropped", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "a" }, { from: "a", to: "b" }, { from: "a", to: "b" }],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.edges.length, 1);
});

Deno.test("an unlabelled node is dropped", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "   " }, { id: "c", label: "C" }],
    edges: [{ from: "a", to: "c" }],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.nodes.map((n) => n.id), ["a", "c"]);
});

Deno.test("a cycle is preserved", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    direction: "right",
    nodes: [{ id: "a", label: "Plan" }, { id: "b", label: "Do" }, { id: "c", label: "Review" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.direction, "right");
  assertEquals(data.edges.length, 3);
});

Deno.test("node and edge counts are capped", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })),
    edges: Array.from({ length: 39 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
  }));
  assert(data && data.kind === "flow");
  assert(data.nodes.length <= FIGURE_LIMITS.maxNodes, `${data.nodes.length}`);
  assert(data.edges.length <= FIGURE_LIMITS.maxEdges, `${data.edges.length}`);
  // Edges referencing the nodes that were cut must have gone with them.
  const ids = new Set(data.nodes.map((n) => n.id));
  for (const edge of data.edges) {
    assert(ids.has(edge.from) && ids.has(edge.to), `dangling ${edge.from}->${edge.to}`);
  }
});

Deno.test("labels are flattened and bounded", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "flow",
    nodes: [{ id: "a", label: "line one\nline   two\ttabbed" }, { id: "b", label: "y".repeat(400) }],
    edges: [{ from: "a", to: "b" }],
  }));
  assert(data && data.kind === "flow");
  assertEquals(data.nodes[0].label, "line one line two tabbed");
  assertEquals(data.nodes[1].label.length, FIGURE_LIMITS.maxLabelChars);
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

Deno.test("a table round-trips", () => {
  const table: FigureData = {
    kind: "table",
    columns: ["Approach", "Strength", "Cost"],
    rows: [["Manual", "Precise", "High"], ["Automated", "Fast", "Low"]],
  };
  assertEquals(parseFigureData(serializeFigureData(table)), table);
});

Deno.test("ragged rows are padded, not rejected", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "table",
    columns: ["A", "B", "C"],
    rows: [["1", "2"], ["1", "2", "3", "4"]],
  }));
  assert(data && data.kind === "table");
  assertEquals(data.rows[0], ["1", "2", ""]);
  assertEquals(data.rows[1], ["1", "2", "3"]);
});

Deno.test("a one-column table is not a table", () => {
  assertEquals(
    parseFigureData(JSON.stringify({ kind: "table", columns: ["Only"], rows: [["x"]] })),
    null,
  );
});

Deno.test("a table with no usable rows is refused", () => {
  assertEquals(
    parseFigureData(JSON.stringify({ kind: "table", columns: ["A", "B"], rows: [["", ""], "nope"] })),
    null,
  );
});

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

Deno.test("a series round-trips", () => {
  const series: FigureData = {
    kind: "series",
    unit: "% of respondents",
    points: [{ label: "Agree", value: 62 }, { label: "Neutral", value: 23 }, { label: "Disagree", value: 15 }],
  };
  assertEquals(parseFigureData(serializeFigureData(series)), series);
});

Deno.test("non-finite values are dropped", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "series",
    points: [{ label: "A", value: 1 }, { label: "B", value: "nope" }, { label: "C", value: 3 }],
  }));
  assert(data && data.kind === "series");
  assertEquals(data.points.map((p) => p.label), ["A", "C"]);
});

Deno.test("numeric strings are accepted", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "series",
    points: [{ label: "A", value: "12.5" }, { label: "B", value: 3 }],
  }));
  assert(data && data.kind === "series");
  assertEquals(data.points[0].value, 12.5);
});

Deno.test("one bar is not a chart", () => {
  assertEquals(
    parseFigureData(JSON.stringify({ kind: "series", points: [{ label: "Only", value: 1 }] })),
    null,
  );
});

Deno.test("negative values survive validation", () => {
  const data = parseFigureData(JSON.stringify({
    kind: "series",
    points: [{ label: "Gain", value: 8 }, { label: "Loss", value: -3 }],
  }));
  assert(data && data.kind === "series");
  assertEquals(data.points[1].value, -3);
});

// ---------------------------------------------------------------------------
// Bracket escaping — this is what lets a marker carry JSON at all.
// ---------------------------------------------------------------------------

Deno.test("brackets inside strings are escaped, structural ones are not", () => {
  // The payload must stay valid JSON — escaping JSON's own array delimiters
  // would make it unparseable — while carrying no unbalanced bracket of its
  // own that could end the enclosing figure marker early.
  const serialized = serializeFigureData(FLOW);
  assert(serialized.includes("["), "array delimiters must survive");
  JSON.parse(serialized);

  const withBrackets = serializeFigureData({
    kind: "table",
    columns: ["A", "B"],
    rows: [["has [ open", "has ] close"]],
  });
  assert(withBrackets.includes("\\u005B"), "open bracket escaped");
  assert(withBrackets.includes("\\u005D"), "close bracket escaped");

  // Walk the payload the way the marker scanner does and confirm no bracket
  // survives inside a string literal.
  let inString = false;
  for (let i = 0; i < withBrackets.length; i++) {
    const ch = withBrackets[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') { inString = false; continue; }
      assert(ch !== "[" && ch !== "]", `raw bracket inside a string at ${i}: ${withBrackets}`);
      continue;
    }
    if (ch === '"') inString = true;
  }
});

Deno.test("a serialized payload has balanced brackets", () => {
  // This is the property the figure-marker scanner depends on.
  for (
    const data of [
      FLOW,
      { kind: "table", columns: ["A", "B"], rows: [["[[[", "]]]"]] },
      { kind: "series", points: [{ label: "a [", value: 1 }, { label: "b ]", value: 2 }] },
    ] as FigureData[]
  ) {
    const serialized = serializeFigureData(data);
    let depth = 0;
    for (const ch of serialized) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      assert(depth >= 0, `went negative in ${serialized}`);
    }
    assertEquals(depth, 0, `unbalanced: ${serialized}`);
  }
});

Deno.test("brackets inside a label survive the round trip", () => {
  const data: FigureData = {
    kind: "table",
    columns: ["Step", "Note"],
    rows: [["Read [appendix]", "see [1]"], ["Unbalanced [", "also ]"]],
  };
  const serialized = serializeFigureData(data);
  assertEquals(parseFigureData(serialized), data);
});

// ---------------------------------------------------------------------------
// figureDataToTable — the universal fallback every format can render.
// ---------------------------------------------------------------------------

Deno.test("a flow degrades to its transitions", () => {
  const table = figureDataToTable(FLOW);
  assertEquals(table.header, ["From", "To", "Transition"]);
  assertEquals(table.rows, [
    ["Submission", "Triage", ""],
    ["Triage", "Decision", "accepted"],
  ]);
});

Deno.test("a single-node flow degrades to one step", () => {
  const table = figureDataToTable({
    kind: "flow",
    direction: "down",
    nodes: [{ id: "a", label: "The idea" }],
    edges: [],
  });
  assertEquals(table.header, ["Step"]);
  assertEquals(table.rows, [["The idea"]]);
});

Deno.test("a series degrades to labels and values", () => {
  const table = figureDataToTable({
    kind: "series",
    unit: "%",
    points: [{ label: "Agree", value: 62 }, { label: "Disagree", value: 38 }],
  });
  assertEquals(table.header, ["", "%"]);
  assertEquals(table.rows, [["Agree", "62"], ["Disagree", "38"]]);
});

Deno.test("a table degrades to itself", () => {
  const data: FigureData = { kind: "table", columns: ["A", "B"], rows: [["1", "2"]] };
  assertEquals(figureDataToTable(data), { header: ["A", "B"], rows: [["1", "2"]] });
});

Deno.test("every valid figure yields a non-empty table", () => {
  // The fallback is what guarantees a figure is never simply absent from a
  // format, so it must be total over everything validation accepts.
  const cases: FigureData[] = [
    FLOW,
    { kind: "flow", direction: "right", nodes: [{ id: "a", label: "Solo" }], edges: [] },
    { kind: "table", columns: ["A", "B"], rows: [["1", "2"]] },
    { kind: "series", points: [{ label: "A", value: 1 }, { label: "B", value: 2 }] },
  ];
  for (const data of cases) {
    const table = figureDataToTable(data);
    assert(table.header.length > 0, `empty header for ${data.kind}`);
    assert(table.rows.length > 0, `empty rows for ${data.kind}`);
  }
});
