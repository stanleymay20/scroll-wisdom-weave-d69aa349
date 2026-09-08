import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stabilizeKdpRender } from "./kdp-render-convergence.ts";

const marker = new Uint8Array([37, 80, 68, 70]);

Deno.test("gutter convergence rerenders when actual count crosses a KDP band", async () => {
  const requested: number[] = [];
  const actualCounts = [151, 151];
  let call = 0;

  const result = await stabilizeKdpRender({
    initialPageCountEstimate: 150,
    bleed: false,
    render: async (officialMinimumInsideMarginPt) => {
      requested.push(officialMinimumInsideMarginPt);
      return { bytes: marker, usedInsideMarginPt: officialMinimumInsideMarginPt };
    },
    inspectPageCount: async () => actualCounts[call++],
  });

  // First render uses 0.375" (27pt), but 151 actual pages require 0.5" (36pt).
  // The second render must therefore use the higher official band.
  assertEquals(requested, [0.375 * 72, 0.5 * 72]);
  assertEquals(result.iterations, 2);
  assertEquals(result.pageCount, 151);
  assertEquals(result.requiredInsideMarginPt, 0.5 * 72);
  assertEquals(result.usedInsideMarginPt, 0.5 * 72);
});

Deno.test("deliberate comfort allowance is allowed but remains distinct from official minimum", async () => {
  const comfort = 18;
  const result = await stabilizeKdpRender({
    initialPageCountEstimate: 150,
    bleed: false,
    render: async (officialMinimumInsideMarginPt) => ({
      bytes: marker,
      usedInsideMarginPt: officialMinimumInsideMarginPt + comfort,
    }),
    inspectPageCount: async () => 151,
  });

  assertEquals(result.iterations, 1);
  assertEquals(result.requiredInsideMarginPt, 0.5 * 72);
  assertEquals(result.usedInsideMarginPt, 0.375 * 72 + comfort);
});

Deno.test("renderer cannot report a gutter below the official minimum it was asked to use", async () => {
  await assertRejects(
    () => stabilizeKdpRender({
      initialPageCountEstimate: 200,
      bleed: false,
      render: async (officialMinimumInsideMarginPt) => ({
        bytes: marker,
        usedInsideMarginPt: officialMinimumInsideMarginPt - 1,
      }),
      inspectPageCount: async () => 200,
    }),
    Error,
    "KDP_RENDER_USED_GUTTER_BELOW_REQUESTED_MINIMUM",
  );
});

Deno.test("non-stabilizing margin loop fails closed at the configured bound", async () => {
  // Force every actual result to require a larger band than the margin the
  // renderer reports by using a deliberately adversarial callback sequence.
  const counts = [151, 301, 501];
  let i = 0;
  await assertRejects(
    () => stabilizeKdpRender({
      initialPageCountEstimate: 150,
      bleed: false,
      maxIterations: 3,
      render: async (officialMinimumInsideMarginPt) => ({
        bytes: marker,
        usedInsideMarginPt: officialMinimumInsideMarginPt,
      }),
      inspectPageCount: async () => counts[i++],
    }),
    Error,
    "KDP_GUTTER_DID_NOT_STABILIZE",
  );
});
