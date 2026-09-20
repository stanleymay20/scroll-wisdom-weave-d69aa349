import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFigureImagePrompt,
  extractFigureSpecs,
  figureImageMarkdown,
  figureTextPolicy,
  parseRawFigureMarkers,
  replaceFigureMarker,
  stripFigureMarkers,
  validateFigureSpecs,
  VISUAL_DENSITY,
  buildFigureMarker,
  figureDataFor,
  resolveFigureRendering,
  stripFigureCaptionPrefix,
} from "./visual-intelligence.ts";
import { parseFigureData } from "./figure-data.ts";

function marker(num: number, type: string, caption: string, description: string): string {
  return `[FIGURE ${num}\nTYPE: ${type}\nCAPTION: ${caption}\nDESCRIPTION: ${description}]`;
}

const RICH = "that breaks down the structure and organizes the hierarchy of the process into stages";

// ---------------------------------------------------------------------------
// figureTextPolicy — the labels ARE the diagram. An unlabelled flowchart is not
// a worse flowchart, it is not a flowchart.
// ---------------------------------------------------------------------------

Deno.test("information graphics are allowed to carry labels", () => {
  for (const visualType of ["flowchart", "matrix", "chart", "taxonomy_tree", "architecture_diagram"] as const) {
    assertEquals(figureTextPolicy(visualType, "academic"), "labelled", visualType);
  }
});

Deno.test("narrative artwork stays textless", () => {
  assertEquals(figureTextPolicy("children_illustration", "children"), "textless");
  assertEquals(figureTextPolicy("comic_panel", "comic"), "textless");
  assertEquals(figureTextPolicy("cinematic_scene", "fiction"), "textless");
});

Deno.test("book type overrides the visual type for artwork-first books", () => {
  // A children's book that happens to describe a flowchart still must not have
  // lettering baked into the picture.
  assertEquals(figureTextPolicy("flowchart", "children"), "textless");
  assertEquals(figureTextPolicy("chart", "comic"), "textless");
});

// ---------------------------------------------------------------------------
// buildFigureImagePrompt — the bug being locked out is a prompt that demands
// labels in its art direction and forbids all text two sentences later.
// ---------------------------------------------------------------------------

Deno.test("a labelled figure is never told to omit all text", () => {
  const prompt = buildFigureImagePrompt({
    description: "A flowchart of the peer review lifecycle",
    visualType: "flowchart",
    bookType: "academic",
    styleHint: "ACADEMIC TEXTBOOK. Every element labeled. Proper axes, annotated callouts.",
    subject: "research methods",
  });
  assertStringIncludes(prompt, "labelled figure");
  assert(!/Do not render any text/i.test(prompt), "labelled figure must not carry the textless clause");
  assertStringIncludes(prompt, "Every element labeled");
});

Deno.test("a textless figure is never told to write labels", () => {
  const prompt = buildFigureImagePrompt({
    description: "A fox waking beneath a wide oak at dawn",
    visualType: "children_illustration",
    bookType: "children",
    styleHint: "CHILDREN'S PICTURE BOOK. Soft watercolour.",
  });
  assertStringIncludes(prompt, "Do not render any text");
  assert(!/labelled figure/i.test(prompt), "textless figure must not carry the labelled clause");
});

Deno.test("exactly one text policy clause is ever present", () => {
  for (const [visualType, bookType] of [
    ["flowchart", "academic"],
    ["children_illustration", "children"],
    ["comic_panel", "comic"],
    ["matrix", "professional"],
    ["cinematic_scene", "fiction"],
    ["workbook_template", "workbook"],
  ] as const) {
    const prompt = buildFigureImagePrompt({
      description: "A description long enough to be meaningful",
      visualType,
      bookType,
      styleHint: "style",
    });
    const clauses = (prompt.match(/TEXT IN IMAGE:/g) || []).length;
    assertEquals(clauses, 1, `${bookType}/${visualType} produced ${clauses} clauses`);
  }
});

// ---------------------------------------------------------------------------
// stripFigureMarkers — a surviving marker is a publication BLOCKER in
// qaPublishability, so "no marker survives" is the invariant that matters.
// ---------------------------------------------------------------------------

Deno.test("structured markers are removed whole", () => {
  const content = `Before.\n\n${marker(1, "flowchart", "Lifecycle", "A flowchart of the lifecycle.")}\n\nAfter.`;
  const stripped = stripFigureMarkers(content);
  assert(!/\[FIGURE/i.test(stripped), stripped);
  assertStringIncludes(stripped, "Before.");
  assertStringIncludes(stripped, "After.");
});

Deno.test("legacy markers are removed", () => {
  const stripped = stripFigureMarkers("Text.\n\n[FIGURE 2: a diagram of the thing]\n\nMore.");
  assert(!/\[FIGURE/i.test(stripped), stripped);
});

Deno.test("a description containing a bracket does not truncate the sweep", () => {
  // The legacy pattern alone stops at the first ']' and would leave the tail
  // of a structured marker behind as loose prose.
  const content = `A.\n\n[FIGURE 1\nTYPE: chart\nCAPTION: Results\nDESCRIPTION: A chart of results [see appendix] across cohorts.]\n\nB.`;
  const stripped = stripFigureMarkers(content);
  assert(!/\[FIGURE/i.test(stripped), stripped);
  assert(!stripped.includes("see appendix"), stripped);
  assert(!stripped.includes("across cohorts"), stripped);
});

Deno.test("a chapter with no markers is returned unchanged in substance", () => {
  const content = "Just prose.\n\nMore prose.";
  assertEquals(stripFigureMarkers(content), content);
});

Deno.test("sweeping clears every marker the pipeline could leave behind", () => {
  // Reproduces the real shape: four markers emitted, density caps specs at two,
  // so figures 3 and 4 were never seen by the validator and used to survive.
  const content = [
    "Intro.",
    marker(1, "flowchart", "One", `A flowchart ${RICH}.`),
    "Body.",
    marker(2, "matrix", "Two", `A matrix ${RICH}.`),
    "Body.",
    marker(3, "taxonomy_tree", "Three", `A taxonomy ${RICH}.`),
    marker(4, "chart", "Four", `A chart ${RICH}.`),
  ].join("\n\n");

  assertEquals(VISUAL_DENSITY.academic.maxFigures, 2);
  const specs = extractFigureSpecs(content, "academic", 1);
  assertEquals(specs.length, 2, "density cap still applies");
  assertEquals(parseRawFigureMarkers(content).length, 4, "but four markers exist in the text");

  const { valid } = validateFigureSpecs(specs);
  const approved = new Set(valid.map((s) => s.figureNumber));
  let out = content;
  for (const m of parseRawFigureMarkers(out).filter((m) => approved.has(m.num))) {
    out = replaceFigureMarker(out, m.fullMatch, "![alt](https://example.test/x.png)");
  }
  // Markers 3 and 4 are still present here — this is the pre-sweep state.
  assert(/\[FIGURE/i.test(out), "precondition: uncapped markers survive rendering");

  out = stripFigureMarkers(out);
  assert(!/\[FIGURE\b[^\]]*\]/i.test(out), "qaPublishability blocker must not fire");
  assertStringIncludes(out, "![alt](https://example.test/x.png)");
});

// ---------------------------------------------------------------------------
// replaceFigureMarker — captions are model-supplied text and may contain '$'.
// ---------------------------------------------------------------------------

Deno.test("a dollar sign in the replacement is inserted literally", () => {
  const content = `Start ${marker(1, "chart", "Cost", "A chart of cost.")} end`;
  const full = parseRawFigureMarkers(content)[0].fullMatch;
  const out = replaceFigureMarker(content, full, "*Figure 1: Cost rose to $5 (up $&$1)*");
  assertStringIncludes(out, "Cost rose to $5 (up $&$1)");
  assert(!/\[FIGURE/i.test(out), out);
});

Deno.test("naive string replacement would have corrupted that", () => {
  // Guards the reason replaceFigureMarker exists rather than String.replace.
  const content = "A [FIGURE 1: x] B";
  const naive = content.replace("[FIGURE 1: x]", "cost $& rose");
  assertStringIncludes(naive, "cost [FIGURE 1: x] rose");
});

// ---------------------------------------------------------------------------
// figureImageMarkdown — alt text and caption are different jobs.
// ---------------------------------------------------------------------------

Deno.test("alt text describes the image and the caption labels it", () => {
  const md = figureImageMarkdown({
    figureNumber: 3,
    caption: "The review lifecycle",
    description: "A flowchart showing a submission moving through triage, peer review and decision.",
    url: "https://example.test/fig3.png",
  });
  assertStringIncludes(md, "![A flowchart showing a submission moving through triage, peer review and decision.](https://example.test/fig3.png)");
  assertStringIncludes(md, "*Figure 3: The review lifecycle*");
});

Deno.test("the structured caption is used, not the first sentence of the description", () => {
  const md = figureImageMarkdown({
    figureNumber: 1,
    caption: "Risk exposure by quadrant",
    description: "A two-by-two matrix. Likelihood on the x axis. Impact on the y axis.",
    url: "https://example.test/f.png",
  });
  assertStringIncludes(md, "*Figure 1: Risk exposure by quadrant*");
  assert(!md.includes("*Figure 1: A two-by-two matrix*"), md);
});

Deno.test("alt text is bounded and single-line", () => {
  const md = figureImageMarkdown({
    figureNumber: 1,
    caption: "C",
    description: "word ".repeat(400),
    url: "https://example.test/f.png",
  });
  const alt = md.slice(md.indexOf("![") + 2, md.indexOf("]("));
  assert(alt.length <= 300, `alt was ${alt.length}`);
  assert(!alt.includes("\n"), "alt must not contain newlines");
});

// ---------------------------------------------------------------------------
// Density: the cap that matters is the book type's, not a constant.
// ---------------------------------------------------------------------------

Deno.test("artwork-first book types approve more than two figures", () => {
  assert(VISUAL_DENSITY.children.maxFigures > 2, "children's books are pictures");
  assert(VISUAL_DENSITY.comic.maxFigures > 2, "comics are pictures");

  const content = Array.from({ length: 5 }, (_, i) =>
    marker(i + 1, "children_illustration", `Scene ${i + 1}`, `An illustration ${RICH}.`)
  ).join("\n\nProse.\n\n");

  const specs = extractFigureSpecs(content, "children", 1);
  assertEquals(specs.length, 5, "all five survive the density cap");
  const { valid } = validateFigureSpecs(specs);
  assertEquals(valid.length, 5, "and all five pass the cognitive gate");
});

// ---------------------------------------------------------------------------
// parseRawFigureMarkers — fullMatch is used to splice rendered output back into
// the chapter, so a truncated one leaves the marker's tail in the manuscript.
// ---------------------------------------------------------------------------

Deno.test("structured markers parse into their fields", () => {
  const content = `A\n\n${marker(2, "Flowchart", "The lifecycle", "A flowchart of the lifecycle.")}\n\nB`;
  const [m] = parseRawFigureMarkers(content);
  assertEquals(m.num, 2);
  assertEquals(m.type, "flowchart");
  assertEquals(m.caption, "The lifecycle");
  assertEquals(m.description, "A flowchart of the lifecycle.");
  assert(m.fullMatch.startsWith("[FIGURE 2"));
  assert(m.fullMatch.endsWith("]"));
});

Deno.test("legacy markers still parse", () => {
  const [m] = parseRawFigureMarkers("x [FIGURE 7: a diagram of the thing] y");
  assertEquals(m.num, 7);
  assertEquals(m.description, "a diagram of the thing");
  assertEquals(m.fullMatch, "[FIGURE 7: a diagram of the thing]");
});

Deno.test("fullMatch spans the whole marker when the description holds brackets", () => {
  const content = `[FIGURE 1\nTYPE: chart\nCAPTION: Results\nDESCRIPTION: A chart of results [see appendix] across cohorts.]`;
  const [m] = parseRawFigureMarkers(content);
  assertEquals(m.description, "A chart of results [see appendix] across cohorts.");
  assertEquals(m.fullMatch, content);
  // The splice that motivates all of this: replacing fullMatch must leave the
  // chapter with no residue of the marker.
  const spliced = replaceFigureMarker(content, m.fullMatch, "![alt](u)");
  assertEquals(spliced, "![alt](u)");
});

Deno.test("adjacent markers are parsed separately", () => {
  const content = `${marker(1, "chart", "One", "First.")}\n${marker(2, "chart", "Two", "Second.")}`;
  const parsed = parseRawFigureMarkers(content);
  assertEquals(parsed.length, 2);
  assertEquals(parsed.map((m) => m.num), [1, 2]);
  assertEquals(parsed[0].description, "First.");
  assertEquals(parsed[1].description, "Second.");
});

Deno.test("an unclosed bracket cannot swallow the chapter", () => {
  const tail = "Real prose that must survive. ".repeat(50);
  const content = `[FIGURE 1\nTYPE: chart\nCAPTION: C\nDESCRIPTION: arr[0 is unbalanced.]\n\n${tail}`;
  const stripped = stripFigureMarkers(content);
  assertStringIncludes(stripped, "Real prose that must survive.");
  assert(!/\[FIGURE/i.test(stripped), stripped);
});

Deno.test("a bare bracket that is not a figure marker is untouched", () => {
  const content = "See [1] and [FIGURES] and [Figure] below.";
  assertEquals(stripFigureMarkers(content), content);
  assertEquals(parseRawFigureMarkers(content).length, 0);
});

// ---------------------------------------------------------------------------
// DATA payloads — the structure a diagram is drawn from.
// ---------------------------------------------------------------------------

const FLOW_JSON =
  '{"kind":"flow","direction":"down","nodes":[{"id":"a","label":"Encoding"},{"id":"b","label":"Storage"}],"edges":[{"from":"a","to":"b"}]}';

function dataMarker(num: number, type: string, caption: string, description: string, data: string): string {
  return `[FIGURE ${num}\nTYPE: ${type}\nCAPTION: ${caption}\nDESCRIPTION: ${description}\nDATA: ${data}]`;
}

Deno.test("a DATA payload is parsed off the marker", () => {
  const content = `Prose.\n\n${dataMarker(1, "flowchart", "Memory", "Three stages of memory.", FLOW_JSON)}\n\nMore.`;
  const [m] = parseRawFigureMarkers(content);
  assertEquals(m.num, 1);
  assertEquals(m.data, FLOW_JSON);
  // The JSON must not leak into the prose description shown under the figure.
  assertEquals(m.description, "Three stages of memory.");
  assert(!m.description.includes("kind"), m.description);
});

Deno.test("a marker without DATA still parses", () => {
  const [m] = parseRawFigureMarkers(marker(1, "flowchart", "C", "A description."));
  assertEquals(m.data, undefined);
  assertEquals(m.description, "A description.");
});

Deno.test("JSON brackets do not end the marker early", () => {
  // The payload's own brackets are balanced, which is exactly what lets the
  // bracket-matching scanner carry JSON inside a bracketed marker at all.
  const content = dataMarker(1, "flowchart", "C", "D", FLOW_JSON);
  const [m] = parseRawFigureMarkers(content);
  assertEquals(m.fullMatch, content);
  assert(m.fullMatch.endsWith("]"));
  assertEquals(figureDataFor(m)?.kind, "flow");
});

Deno.test("figureDataFor rejects a malformed payload", () => {
  const [m] = parseRawFigureMarkers(dataMarker(1, "flowchart", "C", "D", '{"kind":"flow","nodes":"bad"}'));
  assertEquals(figureDataFor(m), null);
});

// ---------------------------------------------------------------------------
// resolveFigureRendering
// ---------------------------------------------------------------------------

Deno.test("a diagram with valid data is drawn from structure", () => {
  const [m] = parseRawFigureMarkers(dataMarker(1, "flowchart", "C", "D", FLOW_JSON));
  const resolved = resolveFigureRendering(m, "flowchart", "academic");
  assertEquals(resolved.mode, "data");
});

Deno.test("a diagram without usable data falls back to an image", () => {
  const [m] = parseRawFigureMarkers(marker(1, "flowchart", "C", "A flowchart of the process."));
  assertEquals(resolveFigureRendering(m, "flowchart", "academic").mode, "image");
});

Deno.test("artwork always takes the image path", () => {
  // A watercolour of a fox is not a flowchart, whatever JSON accompanies it.
  const [m] = parseRawFigureMarkers(dataMarker(1, "children_illustration", "C", "D", FLOW_JSON));
  assertEquals(resolveFigureRendering(m, "children_illustration", "illustrated").mode, "image");
});

Deno.test("artwork-first book types take the image path", () => {
  const [m] = parseRawFigureMarkers(dataMarker(1, "flowchart", "C", "D", FLOW_JSON));
  for (const bookType of ["children", "comic", "fiction"]) {
    assertEquals(resolveFigureRendering(m, "flowchart", bookType).mode, "image", bookType);
  }
});

// ---------------------------------------------------------------------------
// buildFigureMarker — one canonical shape reaches the manuscript.
// ---------------------------------------------------------------------------

Deno.test("a built marker round-trips through the parser", () => {
  const data = parseFigureData(FLOW_JSON)!;
  const built = buildFigureMarker({
    figureNumber: 4,
    visualType: "flowchart",
    caption: "  Memory   stages  ",
    description: "Three\nstages\tof memory.",
    data,
  });
  const [m] = parseRawFigureMarkers(built);
  assertEquals(m.num, 4);
  assertEquals(m.type, "flowchart");
  assertEquals(m.caption, "Memory stages");
  assertEquals(m.description, "Three stages of memory.");
  assertEquals(figureDataFor(m), data);
  assertEquals(m.fullMatch, built);
});

Deno.test("a built marker without data omits the field", () => {
  const built = buildFigureMarker({
    figureNumber: 1,
    visualType: "children_illustration",
    caption: "A fox at dawn",
    description: "A fox waking beneath an oak.",
    data: null,
  });
  assert(!built.includes("DATA:"), built);
  const [m] = parseRawFigureMarkers(built);
  assertEquals(m.data, undefined);
});

Deno.test("a caption containing brackets survives being built and reparsed", () => {
  const data = parseFigureData('{"kind":"table","columns":["A","B"],"rows":[["x [1]","y ]"]]}')!;
  const built = buildFigureMarker({
    figureNumber: 2,
    visualType: "comparison_visual",
    caption: "Comparison",
    description: "A comparison.",
    data,
  });
  const [m] = parseRawFigureMarkers(built);
  assertEquals(m.fullMatch, built, "the marker must not be cut short");
  assertEquals(figureDataFor(m), data);
});

// ---------------------------------------------------------------------------
// The sweep must spare renderable diagrams.
// ---------------------------------------------------------------------------

Deno.test("keepRenderable spares a data-bearing marker", () => {
  const good = dataMarker(1, "flowchart", "Kept", "D", FLOW_JSON);
  const bare = marker(2, "flowchart", "Dropped", "A flowchart of the thing.");
  const content = `A\n\n${good}\n\nB\n\n${bare}\n\nC`;

  const swept = stripFigureMarkers(content, { keepRenderable: true });
  assertStringIncludes(swept, "CAPTION: Kept");
  assert(!swept.includes("CAPTION: Dropped"), swept);
});

Deno.test("a data marker whose payload is broken is still swept", () => {
  const broken = dataMarker(1, "flowchart", "Broken", "D", "{not json");
  const swept = stripFigureMarkers(`A\n\n${broken}\n\nB`, { keepRenderable: true });
  assert(!/\[FIGURE/i.test(swept), swept);
});

Deno.test("the default sweep removes everything, including diagrams", () => {
  // The text-only pipeline relies on this: a text book has no figures at all.
  const content = `A\n\n${dataMarker(1, "flowchart", "C", "D", FLOW_JSON)}\n\nB`;
  assert(!/\[FIGURE/i.test(stripFigureMarkers(content)), "default must strip data markers too");
});

// ---------------------------------------------------------------------------
// Caption prefixes — every renderer prints its own "Figure N:" label, so a
// caption that already carries one must not be printed with two.
// ---------------------------------------------------------------------------

Deno.test("a legacy figure's caption is not prefixed twice", () => {
  // extractFigureSpecs synthesises "Figure 1: <first sentence>" for the legacy
  // [FIGURE 1: description] form, which used to render as
  // "Figure 1: Figure 1: ...".
  const content =
    "[FIGURE 1: A flowchart that breaks down the structure of the review process and organizes each stage. It shows the hierarchy.]";
  const [m] = parseRawFigureMarkers(content);
  const spec = extractFigureSpecs(content, "academic", 1)[0];
  const caption = (m.caption || spec?.caption || "").trim() || `Figure ${m.num}`;
  assertStringIncludes(caption, "Figure 1:");

  const md = figureImageMarkdown({
    figureNumber: 1,
    caption,
    description: m.description,
    url: "https://example.test/f.png",
  });
  assert(!md.includes("Figure 1: Figure 1:"), md);
  assertStringIncludes(md, "*Figure 1: A flowchart that breaks down");
});

Deno.test("stripFigureCaptionPrefix removes the forms captions actually carry", () => {
  assertEquals(stripFigureCaptionPrefix("Figure 3: The lifecycle", 3), "The lifecycle");
  assertEquals(stripFigureCaptionPrefix("Figure 3 - The lifecycle", 3), "The lifecycle");
  assertEquals(stripFigureCaptionPrefix("Figure 3 — The lifecycle", 3), "The lifecycle");
  assertEquals(stripFigureCaptionPrefix("figure 3. The lifecycle", 3), "The lifecycle");
  assertEquals(stripFigureCaptionPrefix("Fig. 3: The lifecycle", 3), "The lifecycle");
  assertEquals(stripFigureCaptionPrefix("Figure 3", 3), "");
});

Deno.test("a caption for a different figure number is left alone", () => {
  // "Figure 2" inside figure 3's caption is a cross-reference, not a prefix.
  assertEquals(
    stripFigureCaptionPrefix("Figure 2 compared with the present model", 3),
    "Figure 2 compared with the present model",
  );
});

Deno.test("an unprefixed caption is unchanged", () => {
  assertEquals(stripFigureCaptionPrefix("The review lifecycle", 1), "The review lifecycle");
  assertEquals(stripFigureCaptionPrefix("Figured out at last", 1), "Figured out at last");
});

Deno.test("a caption that is only a prefix falls back to the description", () => {
  const md = figureImageMarkdown({
    figureNumber: 4,
    caption: "Figure 4",
    description: "A taxonomy of methods. With further detail.",
    url: "https://example.test/f.png",
  });
  assert(!md.includes("Figure 4: Figure 4"), md);
  assertStringIncludes(md, "*Figure 4: A taxonomy of methods*");
});

Deno.test("a built marker stores a bare caption", () => {
  const built = buildFigureMarker({
    figureNumber: 2,
    visualType: "flowchart",
    caption: "Figure 2: The lifecycle",
    description: "A lifecycle.",
    data: parseFigureData(FLOW_JSON),
  });
  const [m] = parseRawFigureMarkers(built);
  assertEquals(m.caption, "The lifecycle");
});
